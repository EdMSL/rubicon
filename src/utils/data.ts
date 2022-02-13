import { screen } from 'electron';
import si from 'systeminformation';
import fs from 'fs';
import path from 'path';

import {
  CustomPathName,
  GameSettingsFileView,
  LauncherButtonAction,
} from '$constants/misc';
import { IIniObj, IXmlObj } from './files';
import {
  LogMessageType,
  writeToLogFile,
  writeToLogFileSync,
} from './log';
import { CreateUserMessage } from './message';
import {
  clearPathVaribale,
  getLineIniParameterValue,
  getParameterRegExp,
  getPathToFile,
} from './strings';
import {
  IGameSettingsItemParameter,
  IGameSettingsParameter,
  IGameSettingsRootState,
  IGameSettingsFile,
  IGameSettingsOptions,
  IGameSettingsOptionsItem,
  IGameSettingsOptionContent,
  IGameSettingsFiles,
} from '$types/gameSettings';
// import { IUserMessage } from '$types/main';
import { ISelectOption } from '$components/UI/Select';
import { IIncorrectGameSettingsFiles } from '$sagas/gameSettings';
import {
  DefaultCustomPath,
  GAME_DIR,
  ICustomPaths,
  IDefaultCustomPaths,
} from '$constants/paths';
import {
  ILauncherAppButton,
  ILauncherCustomButton,
  IMainRootState,
  IModOrganizerParams,
  IUserMessage,
} from '$types/main';
import { defaultModOrganizerParams } from '$constants/defaultParameters';
import { getReadWriteError } from './errors';

const ONE_GB = 1073741824;
const SYMBOLS_TO_TYPE = 8;

/**
 * Получить информацию о доступных дисплеях и записать их в файл лога.
*/
export const getDisplaysInfo = (): void => {
  const mainDisplay = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();

  let result = `Main display info. Resolution: ${mainDisplay.size.width}x${mainDisplay.size.height}, Work Area: ${mainDisplay.workArea.width}x${mainDisplay.workArea.height}, Work Area Size: ${mainDisplay.workAreaSize.width}x${mainDisplay.workAreaSize.height}, Scale: ${mainDisplay.scaleFactor}`; //eslint-disable-line max-len

  if (displays.length > 1) {
    result += '\r\n  All displays:';

    displays.forEach((display, index) => {
      result += `\r\n  ${index}: Resolution: ${display.size.width}x${display.size.height}, Work Area: ${display.workArea.width}x${display.workArea.height}, Work Area Size: ${display.workAreaSize.width}x${display.workAreaSize.height}, Scale: ${mainDisplay.scaleFactor}`; //eslint-disable-line max-len
    });
  }

  writeToLogFileSync(result);
};

/**
 * Получить ифнормацию о системе и записать в файл лога.
*/
export const getSystemInfo = async (): Promise<void> => {
  try {
    const systemData = await si.get({
      cpu: 'manufacturer, brand, speed',
      osInfo: 'distro, arch',
      graphics: 'controllers',
      mem: 'total',
    });
    ///TODO Неверно определяет архитектуру
    let result = `System info.\r\n  OS: ${systemData.osInfo.distro}, ${systemData.osInfo.arch}.\r\n  CPU: ${systemData.cpu.manufacturer} ${systemData.cpu.brand}, ${systemData.cpu.speed}GHz.\r\n  Memory: ${(systemData.mem.total / ONE_GB).toFixed(2)}Gb.`; //eslint-disable-line max-len

    if (systemData.graphics.controllers.length > 1) {
      result += '\r\n  Graphic cards:';

      systemData.graphics.controllers.forEach((element, index) => {
        result += `\r\n  ${index}: ${element.vendor} ${element.model} ${element.vram}Mb.`; //eslint-disable-line max-len
      });
    } else {
      result += `\r\n  Graphics: ${systemData.graphics.controllers[0].vendor} ${systemData.graphics.controllers[0].model} ${systemData.graphics.controllers[0].vram}Mb.`; //eslint-disable-line max-len
    }

    writeToLogFile(result);
  } catch (error: any) {
    writeToLogFile(error.message, LogMessageType.ERROR);
  }
};

/**
 * Получить тип у элемента. В отличие от `typeof` разделяет `array` и `oject`.
 * @param element Элемент, для которого нужно определить тип.
 * @returns Строка с типом элемента.
*/
export const getTypeOfElement = (element: unknown): string => {
  const getElementType = {}.toString;
  const elementType = getElementType.call(element).slice(SYMBOLS_TO_TYPE, -1);
  return elementType;
};

export interface IGeneratedGameSettingsParam {
  optionName: string,
  optionValue: string,
  optionErrors: IUserMessage[],
}

export const isIGameSettingsItemParameter = (
  parameter: IGameSettingsParameter | IGameSettingsItemParameter,
): parameter is IGameSettingsItemParameter => parameter.valuePath !== undefined && parameter.valueName !== undefined;

export const isDataFromIniFile = (
  fileView: string,
  obj: IIniObj|IXmlObj,
): obj is IIniObj => fileView === GameSettingsFileView.LINE || fileView === GameSettingsFileView.SECTIONAL;

/**
 * Сгенерировать имя игровой опции на основе параметра, который является основой для опции
 * @param parameter Параметр-основа для игровой опции.
*/
export const getOptionName = (
  parameter: IGameSettingsParameter|IGameSettingsItemParameter,
): string => {
  if (isIGameSettingsItemParameter(parameter)) {
    return `${parameter.valuePath}/${parameter.name}/${parameter.valueName}`;
  }

  if (parameter.iniGroup) {
    return `${parameter.iniGroup}/${parameter.name}`;
  }

  return parameter.name!;
};

export const getValueFromObjectDeepKey = <T>(lib, keys): T => {
  const key = keys.shift();

  return keys.length ? getValueFromObjectDeepKey(lib[key], keys) : lib[key];
};

export const setValueForObjectDeepKey = (lib, keys, newValue): void => {
  const key = keys.shift();

  if (keys.length) {
    setValueForObjectDeepKey(lib[key], keys, newValue);
  } else {
    lib[key] = newValue; //eslint-disable-line no-param-reassign
  }
};

/**
 * Генерирует объект с полями, необходимыми для создания
 * объекта игровой опции для записи в state.
 * @param currentFileData Данные из файла, которые используются в опции.
 * @param currentGameSettingParameter Объект параметра, на основе которого создается опция.
 * @param fileView Вид структуры файла.
 * @param gameSettingsFileName Имя, используемой в settings.json для данного файла.
 * @param baseFileName Полное базовое имя файла.
 * @param moProfileName Профиль МО.
*/
export const getOptionData = (
  currentFileData: IIniObj|IXmlObj,
  currentGameSettingParameter: IGameSettingsParameter|IGameSettingsItemParameter,
  fileView: string,
  gameSettingsFileName: string,
  baseFileName: string,
  moProfileName = '',
): IGeneratedGameSettingsParam => {
  const optionErrors: IUserMessage[] = [];
  let optionName;
  let optionSettingGroup;
  let optionValue = '';

  if (fileView === GameSettingsFileView.SECTIONAL) {
    optionSettingGroup = currentFileData.getSection(currentGameSettingParameter.iniGroup);

    if (!optionSettingGroup) {
      optionErrors.push(CreateUserMessage.warning(
        `The ${baseFileName} file${moProfileName ? ` from the "${moProfileName}" profile` : ''} does not contain the "${currentGameSettingParameter.iniGroup}" group specified in ${currentGameSettingParameter.name} from "${gameSettingsFileName}"`, //eslint-disable-line max-len
      ));
    } else {
      const parameterLine = optionSettingGroup.getLine(currentGameSettingParameter.name);

      if (parameterLine) {
        optionName = `${optionSettingGroup.name}/${parameterLine.key}`;
        optionValue = parameterLine.value;
      } else {
        optionErrors.push(CreateUserMessage.warning(
          `The "${currentGameSettingParameter.iniGroup}" group from the ${baseFileName} file${moProfileName ? ` from the "${moProfileName}" profile` : ''} does not contain the "${currentGameSettingParameter.name}" parameter specified in "${gameSettingsFileName}"`, //eslint-disable-line max-len
        ));
      }
    }
  } else if (fileView === GameSettingsFileView.LINE) {
    currentFileData.globals.lines.some((line) => {
      const searchRegexp = getParameterRegExp(currentGameSettingParameter.name!.trim());

      optionValue = getLineIniParameterValue(line.text, searchRegexp);

      if (optionValue) {
        optionName = currentGameSettingParameter.name;
      }

      return Boolean(optionValue);
    });

    if (!optionName) {
      optionErrors.push(CreateUserMessage.warning(
        `The ${baseFileName} file${moProfileName ? ` from the "${moProfileName}" profile` : ''} does not contain the "${currentGameSettingParameter.name}" parameter, specified in "${gameSettingsFileName}"`, //eslint-disable-line max-len
      ));
    }
  } else if (fileView === GameSettingsFileView.TAG) {
    const valuePathArr = [...currentGameSettingParameter.valuePath!?.split('/')];
    const pathArr = [
      ...valuePathArr,
      currentGameSettingParameter.name!,
      currentGameSettingParameter.valueName!,
    ];

    let index = 0;
    const getProp = (obj, key): void => {
      index += 1;

      if (typeof obj[key] === 'object') {
        getProp(obj[key], pathArr[index]);
      } else if (key === currentGameSettingParameter.valueName) {
        optionName = pathArr.join('/');
        optionValue = obj[currentGameSettingParameter.valueName!];
      }
    };

    getProp(currentFileData, pathArr[index]);

    if (!optionName || !optionValue) {
      let errorMsg = '';
      if (index === pathArr.length) {
        errorMsg = `The ${baseFileName} file${moProfileName ? ` from the "${moProfileName}" profile` : ''} does not contain "${currentGameSettingParameter.valueName}" attribute in "${currentGameSettingParameter.name}" parameter specified in "${gameSettingsFileName}".`; //eslint-disable-line max-len
      } else if (index === pathArr.length - 1) {
        errorMsg = `The ${baseFileName} file${moProfileName ? ` from the "${moProfileName}" profile` : ''} does not contain "${currentGameSettingParameter.name}" parameter specified in "${gameSettingsFileName}".`; //eslint-disable-line max-len
      } else {
        errorMsg = `The ${baseFileName} file${moProfileName ? ` from the "${moProfileName}" profile` : ''} does not contain "${pathArr[index - 1]}" tag specified in "valuePath" in "${gameSettingsFileName}".`; //eslint-disable-line max-len
      }
      optionErrors.push(CreateUserMessage.warning(errorMsg));
    }
  }

  return {
    optionName,
    optionValue,
    optionErrors,
  };
};

/**
 * Генерирует опции (`options`) для UI компонента `Select`.
 * @param obj Объект или массив строк, на основе которых будет сгенерирован список опций.
 * @returns Массив с опциями.
*/
export const generateSelectOptions = (
  obj: { [key: string]: string, } | string[],
): ISelectOption[] => {
  if (Array.isArray(obj)) {
    return obj.map((key) => ({
      label: key,
      value: key,
    }));
  }

  return Object.keys(obj).map((key) => ({
    label: obj[key],
    value: key,
  }));
};

/**
 * Фильтрует файлы с ошибками в параметрах.
 * @param gameSettingsFiles Игровые файлы.
 * @param incorrectGameSettingsFiles Объект с массивами некорректных параметров файлов.
 * @returns Объект `gameSettingsFiles`, содержащий только корректные значения.
*/
export const filterIncorrectGameSettingsFiles = (
  gameSettingsFiles: IGameSettingsFiles,
  incorrectGameSettingsFiles: IIncorrectGameSettingsFiles,
): IGameSettingsFiles => Object.keys(gameSettingsFiles)
  .reduce<IGameSettingsFiles>((newGameSettingsFiles, gameSettingsFileName) => {
    const currentFile = gameSettingsFiles[gameSettingsFileName];
    const currentFileIncorrectIndexes = incorrectGameSettingsFiles[gameSettingsFileName];

    if (Object.keys(incorrectGameSettingsFiles).includes(gameSettingsFileName)) {
      if (currentFile.optionsList.length === currentFileIncorrectIndexes.length) {
        return { ...newGameSettingsFiles };
      }

      return {
        ...newGameSettingsFiles,
        [gameSettingsFileName]: {
          ...currentFile,
          optionsList: [
            ...currentFile.optionsList
              .filter((parameter, index) => !currentFileIncorrectIndexes.includes(index)),
          ],
        },
      };
    }
    return {
      ...newGameSettingsFiles,
      [gameSettingsFileName]: { ...currentFile },
    };
  }, {});

/**
 * Получает список параметров для вывода в виде опций. Если есть `gameSettingsGroups`,
 * то фильтрует по текущей группе.
 * @param GameSettingsFile Объект текущего обрабатываемого файла из `state`.
 * @param gameSettingsGroups Список доступных групп настроек из `state`.
 * @param currentGameSettingGroup текущая группа настроек.
 * @returns Массив с параметрами для генерации игровый опций.
*/
export const getParametersForOptionsGenerate = (
  gameSettingsFile: IGameSettingsFile,
  gameSettingsGroups: IGameSettingsRootState['gameSettingsGroups'],
  currentGameSettingGroup: string,
): IGameSettingsParameter[] => {
  if (gameSettingsGroups.length > 0 && currentGameSettingGroup) {
    return gameSettingsFile.optionsList.filter(
      (currentParameter) => currentParameter.settingGroup === currentGameSettingGroup,
    );
  }

  return gameSettingsFile.optionsList;
};

/**
 * Генерирует игровую опцию для `gameSettingsOptions` из `state` с новым значением `value`.
 * @param gameSettingsOptions Опции игровых настроек из `state`.
 * @param fileName Имя файла, из которого взят параметр для генерируемой опции.
 * @param optionName Имя опции из `gameSettingsOptions`.
 * @param newValue Новое значение `value` для опции.
 * @returns Объект опции.
*/
export const generateNewGameSettingsOption = (
  gameSettingsOptions: IGameSettingsOptions,
  fileName: string,
  optionName: string,
  newValue: string|number,
): IGameSettingsOptionsItem => ({
  [optionName]: {
    ...gameSettingsOptions[fileName][optionName],
    value: String(newValue),
  },
});

/**
 * Получить опции игровых настроек, которые были изменены пользователем.
 * @param gameSettingsOptions Игровые опции из `state`.
*/
export const getChangedGameSettingsOptions = (
  gameSettingsOptions: IGameSettingsOptions,
): IGameSettingsOptions => Object.keys(gameSettingsOptions)
  .reduce<IGameSettingsOptions>((totalOptions, fileName) => {
    const currentOptions = Object.keys(gameSettingsOptions[fileName])
      .reduce<IGameSettingsOptionsItem>((options, optionName) => {
        const parameter = gameSettingsOptions[fileName][optionName];

        if (parameter.value !== parameter.default) {
          return {
            ...options,
            [optionName]: {
              ...gameSettingsOptions[fileName][optionName],
            },
          };
        }

        return {
          ...options,
        };
      }, {});

    if (Object.keys(currentOptions).length > 0) {
      return {
        ...totalOptions,
        [fileName]: {
          ...totalOptions[fileName],
          ...currentOptions,
        },
      };
    }

    return {
      ...totalOptions,
    };
  }, {});

/**
 * Получить опции игровых настроек со стандартными значениями (последними сохраненными).
 * @param gameSettingsOptions Игровые опции из `state`.
*/
export const getGameSettingsOptionsWithDefaultValues = (
  gameSettingsOptions: IGameSettingsOptions,
  isWithDefaultValue = true,
): IGameSettingsOptions => {
  const newOptionsObj = { ...gameSettingsOptions };

  const getProp = (
    obj: IGameSettingsOptions|IGameSettingsOptionsItem|IGameSettingsOptionContent,
  ): void => {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'object') {
        getProp(obj[key]);
      } else if (obj.value !== obj.default && isWithDefaultValue) {
        obj.value = obj.default; //eslint-disable-line no-param-reassign
      } else if (obj.default !== obj.value && !isWithDefaultValue) {
        obj.default = obj.value; //eslint-disable-line no-param-reassign
      }
    });
  };

  getProp(newOptionsObj);

  return newOptionsObj;
};

/**
 * Сгенерировать имя папки для бэкапа файлов.
 * @returns Строка с именем для папки.
*/
export const getBackupFolderName = (): string => {
  const date = new Date();

  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}_${date.toTimeString().split(' ')[0].split(':').join('.')}`; // eslint-disable-line max-len
};

/**
 * Изменить строку с указанным параметром на строку с новым значением параметра.
 * Изменяет(мутирует) входные данные `iniData`.
 * @param iniData Входные данные файла, в котором находится изменяемый параметр.
 * @param sectionName Секция файла, в которой лежит изменяемый параметр.
 * @param parameterName Изменяемый параметр.
 * @param newValue Новое значение для параметра.
*/
export const changeSectionalIniParameter = (
  iniData: IIniObj,
  sectionName: string,
  parameterName: string,
  newValue: string,
): void => {
  const defaultLineText: string = iniData
    .getSection(sectionName)
    .getLine(parameterName).text;
  const spacesBefore = defaultLineText.match(/(\s*)=/gm)![0];
  const spacesAfter = defaultLineText.match(/(?<==)\s*(?<!\S)/);

  iniData
    .getSection(sectionName)
    .setValue(
      parameterName,
      newValue,
    );

  const currLineText = iniData
    .getSection(sectionName)
    .getLine(parameterName)
    .text
    .split('=')
    .join(`${spacesBefore}${spacesAfter ? spacesAfter.join('') : []}`);

  iniData //eslint-disable-line no-param-reassign
    .getSection(sectionName)
    .getLine(parameterName).text = currLineText;
};

export const getApplicationArgs = (args: string[]): string[] => args.map((arg) => {
  let newArg = arg;

  if (CustomPathName.GAME_DIR_REGEXP.test(arg)) {
    newArg = getPathToFile(arg, { ...DefaultCustomPath }, '');
  }

  if (/^-.+$/.test(newArg)) {
    return newArg;
  }

  return `"${newArg}"`;
});

/**
 * Получить список пользовательских тем для записи в `state`.
*/
export const getUserThemes = (themesFolders: string[]): { [key: string]: string, } => {
  const themesObjects = themesFolders.reduce((themes, theme) => ({
    ...themes,
    [theme]: theme,
  }), {});

  return {
    '': 'default',
    ...themesObjects,
  };
};

/**
 * Получить параметры Mod Organizer c учетом данных из config.json.
 * @param data Данные из секции modOrganizer файла config.json.
 * @returns Объект с данными Mod Organizer.
*/
export const getNewModOrganizerParams = (data: IModOrganizerParams): IModOrganizerParams => {
  if (data.path) {
    return {
      ...defaultModOrganizerParams,
      ...data,
      path: data.path,
      pathToINI:
        data.pathToINI
        || defaultModOrganizerParams.pathToINI.replace(defaultModOrganizerParams.path, data.path),
      pathToProfiles:
        data.pathToProfiles
        || defaultModOrganizerParams.pathToProfiles.replace(defaultModOrganizerParams.path, data.path),
      pathToMods:
        data.pathToMods
        || defaultModOrganizerParams.pathToMods.replace(defaultModOrganizerParams.path, data.path),
    };
  }

  return {
    ...defaultModOrganizerParams,
    ...data,
  };
};

/**
 * Генерация переменных путей.
 * @param configData Данные из файла config.json.
 * @param app Объект Electron.app.
 * @returns Объект с пользовательскими путями.
*/
export const createCustomPaths = (
  configData: IMainRootState['config'],
  app: Electron.App,
): { default: IDefaultCustomPaths, custom: ICustomPaths, } => {
  const newCustomPaths = Object.keys(configData.customPaths).reduce((paths, currentPathKey) => ({
    ...paths,
    [currentPathKey]: path.join(GAME_DIR, clearPathVaribale(configData.customPaths[currentPathKey])),
  }), {});

  return {
    default: {
      ...DefaultCustomPath,
      '%DOCUMENTS%': app.getPath('documents'),
      ...configData.documentsPath ? {
        '%DOCS_GAME%': path.join(app.getPath('documents'), clearPathVaribale(configData.documentsPath)),
      } : {},
      ...configData.modOrganizer.isUsed ? {
        '%MO_DIR%': path.join(GAME_DIR, clearPathVaribale(configData.modOrganizer.path)),
        '%MO_MODS%': path.join(GAME_DIR, clearPathVaribale(configData.modOrganizer.pathToMods)),
        '%MO_PROFILE%': path.join(GAME_DIR, clearPathVaribale(configData.modOrganizer.pathToProfiles)),
      } : {},
    },
    custom: {
      ...newCustomPaths,
    },
  };
};

/**
 * Получить данные для генерации пользовательских кнопок.
 * @param buttonsData Данные о кнопках из config.json.
 * @param customPaths Объект с переменными путей.
 * @returns Массив объектов пользовательских кнопок.
*/
export const getCustomButtons = (
  buttonsData: ILauncherAppButton[],
  customPaths: IDefaultCustomPaths,
  // Типы определяются неверно, после filter отсекутся все undefined,
  // но ts все равно считает, что они там есть.
  //@ts-ignore
): ILauncherCustomButton[] => buttonsData.map<ILauncherCustomButton|undefined>((btn) => {
  try {
    const pathTo = getPathToFile(btn.path, { ...customPaths }, '');

    return {
      ...btn,
      action: fs.statSync(pathTo).isDirectory()
        ? LauncherButtonAction.OPEN
        : LauncherButtonAction.RUN,
      path: pathTo,
    };
  } catch (error: any) {
    const err = getReadWriteError(error);

    writeToLogFileSync(
      `Can't create custom button. ${btn.label}. ${err.message} Path: ${btn.path}`,
      LogMessageType.WARNING,
    );

    return undefined;
  }
}).filter(Boolean);
