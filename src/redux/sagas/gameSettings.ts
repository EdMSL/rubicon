import { SagaIterator } from 'redux-saga';
import {
  call,
  put,
  takeLatest,
  select,
  all,
  SagaReturnType,
  delay,
} from 'redux-saga/effects';
import path from 'path';
import Joi from 'joi';

import { IAppState } from '$store/store';
import {
  IIniObj,
  IXmlObj,
  readDirectory,
  readFileForGameSettingsOptions,
  readINIFile,
  readJSONFile,
  readJSONFileSync,
  writeGameSettingsFile,
  writeINIFile,
  xmlAttributePrefix,
} from '$utils/files';
import { IUnwrap, IUnwrapSync } from '$types/common';
import {
  addMessages,
  setIsGameSettingsAvailable,
  setIsGameSettingsLoaded,
  setIsGameSettingsLoading,
  setIsGameSettingsSaving,
  setIsLauncherConfigChanged,
} from '$actions/main';
import { GAME_SETTINGS_FILE_PATH } from '$constants/paths';
import {
  checkGameSettingsFiles, checkGameSettingsParameters, checkGameSettingsConfigShallow, checkGameSettingsConfigFull, ICheckResult,
} from '$utils/check';
import {
  GAME_SETTINGS_TYPES,
  IGameSettingsConfig,
  IGameSettingsFile,
  // IGameSettingsFiles,
  IGameSettingsOptions,
  IGameSettingsOptionsItem,
  IGameSettingsParameter,
} from '$types/gameSettings';
import {
  LogMessageType,
  writeToLogFile,
  writeToLogFileSync,
} from '$utils/log';
import { CreateUserMessage } from '$utils/message';
import {
  changeMoProfile,
  setGameSettingsConfig,
  setGameSettingsOptions,
  setGameSettingsFiles,
  setMoProfile,
  setMoProfiles,
  saveGameSettingsFiles,
  setGameSettingsParameters,
} from '$actions/gameSettings';
import {
  CustomError,
  ReadWriteError,
  SagaError,
} from '$utils/errors';
import {
  changeSectionalIniParameter,
  // filterIncorrectGameSettingsFiles,
  getGameSettingsOptionsWithDefaultValues,
  getOptionData,
  isDataFromIniFile,
  setValueForObjectDeepKey,
} from '$utils/data';
import { IUserMessage } from '$types/main';
import {
  PathRegExp,
  Encoding,
  GameSettingsOptionType,
  GameSettingsFileView,
} from '$constants/misc';
import { RoutesWindowName } from '$constants/routes';
import {
  getParameterRegExp,
  getPathToFile,
  getStringPartFromIniLineParameterForReplace,
} from '$utils/strings';

interface IGetDataFromFilesResult {
  [key: string]: IIniObj|IXmlObj,
}

export interface IIncorrectGameSettingsFiles {
  [key: string]: number[],
}

const getState = (state: IAppState): IAppState => state;

/**
 * Получить данные из файла игровых настроек
 * settings.json и проверить данные на валидность.
 * @returns Объект с данными из settings.json и ошибками валидации.
*/
export function* getGameSettingsConfigSaga(): SagaIterator<ICheckResult<IGameSettingsConfig>> {
  try {
    const gameSettingsObj: IGameSettingsConfig = yield call(readJSONFile, GAME_SETTINGS_FILE_PATH);
    yield delay(3000);
    return checkGameSettingsConfigFull(gameSettingsObj);
  } catch (error: any) {
    let errorMessage = '';

    if (error instanceof CustomError) {
      errorMessage = error.message;
    } else if (error instanceof ReadWriteError) {
      errorMessage = `${error.message}. Path: '${error.path}'.`;
    } else {
      errorMessage = `Unknown error. Message: ${error.message}`;
    }

    throw new SagaError('Get game settings config saga', errorMessage, error);
  }
}

/**
 * Получить список профилей Mod Organizer и записать в `state`
*/
function* getMOProfilesSaga(): SagaIterator {
  const {
    main: { pathVariables },
  }: ReturnType<typeof getState> = yield select(getState);

  try {
    const profiles: IUnwrap<typeof readDirectory> = yield call(
      readDirectory,
      pathVariables['%MO_PROFILE%'],
    );

    if (profiles.length > 0) {
      yield put(setMoProfiles(profiles));
    } else {
      throw new CustomError('There are no profiles in the profiles folder.');
    }
  } catch (error: any) {
    let errorMessage = '';

    if (error instanceof CustomError) {
      errorMessage = error.message;
    } else if (error instanceof ReadWriteError) {
      errorMessage = `${error.message}. Path '${pathVariables['%MO_PROFILE%']}'.`;
    } else {
      errorMessage = `Unknown error. Message: ${error.message}`;
    }

    throw new SagaError('Get Mod Organizer profiles', errorMessage);
  }
}

/**
 * Получить данные из файла ModOrganizer.ini и записать нужные параметры в `state`
 * @returns Строка с профилем ModOrganizer
*/
function* getDataFromMOIniSaga(): SagaIterator<string> {
  try {
    const {
      main: {
        config: {
          modOrganizer: {
            version,
            profileSection,
            profileParam,
            profileParamValueRegExp,
          },
        },
        pathVariables,
      },
    }: ReturnType<typeof getState> = yield select(getState);

    const iniData: IUnwrap<typeof readINIFile> = yield call(
      readINIFile,
      pathVariables['%MO_INI%'],
    );

    const currentMOProfileIniSection = iniData.getSection(profileSection);

    if (currentMOProfileIniSection) {
      const profileName = currentMOProfileIniSection.getValue(profileParam);

      if (profileName) {
        ///TODO Обработать случай для кастомного regexp
        if (profileParamValueRegExp) {
          const result = profileName.match(new RegExp(profileParamValueRegExp)) || [];

          if (result.length > 0) {
            // eslint-disable-next-line prefer-destructuring
            return result[1];
          }

          throw new CustomError('profileParamValueRegExp');
        }

        if (version === 1) {
          return profileName.toString();
        }

        if (version === 2) {
          return profileName.match(/@ByteArray\((.+)\)/)![1];
        }

        return profileName.toString();
      }

      throw new CustomError('profileName');
    } else {
      throw new CustomError('profileSection');
    }
  } catch (error: any) {
    let errorMessage = '';

    if (error instanceof CustomError) {
      yield put(setMoProfile(''));

      errorMessage = `Can't get current Mod Organizer profile. Problem with: ${error.message}`;
    } else if (error instanceof ReadWriteError) {
      errorMessage = `${error.message}. Path '${error.path}'.`;
    } else {
      errorMessage = `Unknown error. Message: ${error.message}`;
    }

    yield put(addMessages([CreateUserMessage.error(
      'Не удалось получить текущий профиль Mod Organizer. Настройки из файлов, привязанных к профилю, будут недоступны. Подробности в файле лога.', //eslint-disable-line max-len
    )]));

    throw new SagaError('Get data from Mod Organizer INI file', errorMessage);
  }
}

/**
 * Считывает данные из файлов для генерации игровых опций
 * @param filesForRead Игровые файлы, из которых нужно получить данные.
 * @param isWithPrefix Нужно ли добавлять префикс к именам атрибутов. По умолчанию `false`.
*/
function* getDataFromGameSettingsFilesSaga(
  filesForRead: IGameSettingsFile[],
  moProfile: string,
  isWithPrefix = false,
): SagaIterator<IGetDataFromFilesResult> {
  try {
    const {
      main: { pathVariables },
      gameSettings: { baseFilesEncoding },
    }: ReturnType<typeof getState> = yield select(getState);

    const currentFilesData: IUnwrap<typeof readFileForGameSettingsOptions>[] = yield all(
      filesForRead.map((file) => call(
        readFileForGameSettingsOptions,
        file,
        pathVariables,
        moProfile,
        baseFilesEncoding,
        isWithPrefix,
      )),
    );

    return currentFilesData.reduce<IGetDataFromFilesResult>(
      (filesData, currentFile) => ({
        ...filesData,
        ...currentFile,
      }),
      {},
    );
  } catch (error: any) {
    throw new SagaError('Get data from game settings files', error.message);
  }
}

/**
 * Генерирует список игровых опций на основе параметров
 * (`gameSettingsFiles`) из файлов, указанных в settings.json
 * @param gameSettingsFiles Массив объектов игровых файлов.
 * @param gameSettingsParameters Игровые параметры для генерации опций.
 * @param moProfile Профиль Mod Organizer.
*/
export function* generateGameSettingsOptionsSaga(
  gameSettingsFiles: IGameSettingsFile[],
  gameSettingsParameters: IGameSettingsParameter[],
  moProfile: string,
): SagaIterator<IGameSettingsOptions> {
  try {
    // let incorrectGameSettingsFiles: IIncorrectGameSettingsFiles = {};
    let optionsErrors: IUserMessage[] = [];

    const currentFilesDataObj: SagaReturnType<typeof getDataFromGameSettingsFilesSaga> = yield call(
      getDataFromGameSettingsFilesSaga,
      gameSettingsFiles,
      moProfile,
    );

    const totalGameSettingsOptions: IGameSettingsOptions = gameSettingsParameters.reduce(
      (gameSettingsOptions, currentParameter, index) => {
        const incorrectIndexes: number[] = [];
        const currentGameSettingsFile: IGameSettingsFile = gameSettingsFiles.find((file) => file.name === currentParameter.file)!;

        // const optionsFromFile = currentGameSettingsFile.optionsList.reduce<IGameSettingsOptionsItem>(
        // (currentOptions, currentParameter, index) => {
        //Если опция с типом group, combined или related,
        // то генерация производится для каждого параметра в items.
        if (
          currentParameter.optionType === GameSettingsOptionType.RELATED
              || currentParameter.optionType === GameSettingsOptionType.GROUP
              || currentParameter.optionType === GameSettingsOptionType.COMBINED
        ) {
          let specParamsErrors: IUserMessage[] = [];

          const optionsFromParameter = currentParameter.items!.reduce<IGameSettingsOptionsItem>(
            (options, currentOption) => {
              const {
                optionName, optionValue, optionErrors,
              } = getOptionData(
                currentFilesDataObj[currentParameter.file],
                currentOption,
                currentGameSettingsFile!.view,
                currentGameSettingsFile!.name,
                path.basename(currentGameSettingsFile!.path),
                moProfile,
              );

              if (optionErrors.length > 0) {
                specParamsErrors = [...optionErrors];
                incorrectIndexes.push(index);

                return { ...options };
              }

              return {
                ...options,
                [optionName]: {
                  default: optionValue,
                  value: optionValue,
                  parent: currentGameSettingsFile!.name,
                },
              };
            },
            {},
          );

          if (specParamsErrors.length > 0) {
            optionsErrors = [...optionsErrors, ...specParamsErrors];

            return { ...gameSettingsOptions };
          }

          return {
            ...gameSettingsOptions,
            ...optionsFromParameter,
          };
        }

        const {
          optionName, optionValue, optionErrors,
        } = getOptionData(
          currentFilesDataObj[currentGameSettingsFile!.name],
          currentParameter,
          currentGameSettingsFile.view,
          currentGameSettingsFile.name,
          path.basename(currentGameSettingsFile.path),
          moProfile,
        );

        if (optionErrors.length > 0) {
          optionsErrors = [...optionsErrors, ...optionErrors];
          incorrectIndexes.push(index);

          return { ...gameSettingsOptions };
        }

        return {
          ...gameSettingsOptions,
          [optionName]: {
            default: optionValue,
            value: optionValue,
            parent: currentGameSettingsFile.name,
          },
        };
        // };
        //   {},
        // );

        // if (incorrectIndexes.length > 0) {
        //   incorrectGameSettingsFiles = {
        //     ...incorrectGameSettingsFiles,
        //     [currentGameSettingsFileName]: incorrectIndexes,
        //   };
        // }

        // if (Object.keys(optionsFromFile).length > 0) {
        //   return {
        //     ...gameSettingsOptions,
        //     [currentGameSettingsFileName]: optionsFromFile,
        //   };
        // }

        // return {
        //   ...gameSettingsOptions,
        // };
      },
      {},
    );

    if (optionsErrors.length > 0) {
      optionsErrors.forEach((message) => {
        writeToLogFile(message.text, message.type);
      });
    }
    console.log(totalGameSettingsOptions);
    return totalGameSettingsOptions;
    // return {
    //   totalGameSettingsOptions,
    //   incorrectGameSettingsFiles,
    // };
  } catch (error: any) {
    throw new SagaError('Generate game settings options', error.message);
  }
}

/**
 * Инициализация игровых настроек для режима разработчика.
 * Только проверка полей на валидность и запись в `state`.
 */
export function* initGameSettingsDeveloperSaga(
  isFromUpdateAction = false,
): SagaIterator {
  try {
    yield put(setIsGameSettingsLoading(true));
    yield put(setIsGameSettingsLoaded(false));

    const {
      data: settingsConfig,
      errors,
    }: SagaReturnType<typeof getGameSettingsConfigSaga> = yield call(getGameSettingsConfigSaga);

    if (errors.length > 0) {
      yield put(addMessages([CreateUserMessage.warning('Обнаружены ошибки в файле settings.json. Подробности в файле лога.', RoutesWindowName.DEV)]));//eslint-disable-line max-len
    }
    yield put(setGameSettingsConfig(settingsConfig));
    yield put(setIsGameSettingsLoaded(true));
  } catch (error: any) {
    let errorMessage = '';

    if (error instanceof SagaError) {
      errorMessage = `Error in "${error.sagaName}". ${error.message}`;
    } else if (error instanceof CustomError) {
      errorMessage = `${error.message}`;
    } else if (error instanceof ReadWriteError) {
      errorMessage = `${error.message}. Path "${error.path}".`;
    } else {
      errorMessage = `Unknown error. Message: ${error.message}`;
    }

    writeToLogFile(errorMessage);
  } finally {
    yield put(setIsGameSettingsLoading(false));
    // if (isFromUpdateAction) {
    // }
  }
}

/**
 * Инициализация игровых настроек. Осуществляется при первом переходе на экран настроек.
 * Получаем данные МО, проверяем на валидность параметры игровых настроек (`gameSettingsFiles`)
 * и переписываем их в случае невалидности некоторых полей, генерируем опции игровых настроек.
*/
export function* initGameSettingsSaga(
  isFromUpdateAction = false,
  settingsFiles?: IGameSettingsConfig['gameSettingsFiles'],
): SagaIterator {
  try {
    writeToLogFileSync('Game settings initialization started.');

    yield put(setIsGameSettingsLoading(true));
    yield put(setIsGameSettingsLoaded(false));

    const {
      gameSettings: {
        baseFilesEncoding,
        gameSettingsGroups,
        gameSettingsFiles: settingsFilesFromState,
        gameSettingsParameters,
      },
      main: {
        config: {
          modOrganizer: {
            isUsed: isMOUsed,
          },
        },
        isLauncherConfigChanged,
      },
    }: ReturnType<typeof getState> = yield select(getState);

    // let gameSettingsFiles: IGameSettingsFile[];

    // if (settingsFiles) {
    //   gameSettingsFiles = settingsFiles;
    // } else {
    //   const {
    //     data: settingsConfig,
    //     errors: configErrors,
    //   }: SagaReturnType<typeof getGameSettingsConfigSaga> = yield call(getGameSettingsConfigSaga);

    //   gameSettingsFiles = settingsConfig.gameSettingsFiles;
    // }

    const {
      data: settingsConfig,
      errors,
    }: SagaReturnType<typeof getGameSettingsConfigSaga> = yield call(getGameSettingsConfigSaga);

    // if (settingsFiles) {
    //   gameSettingsFiles = settingsFiles;
    // } else {
    //   gameSettingsFiles = settingsFilesFromState;
    // }

    let moProfile: string = '';

    if (isMOUsed) {
      yield call(getMOProfilesSaga);

      moProfile = yield call(getDataFromMOIniSaga);
      yield put(setMoProfile(moProfile));
    }

    // const {
    //   data: parameters,
    //   errors, // eslint-disable-line prefer-const
    // }: IUnwrapSync<typeof checkGameSettingsParameters> = yield call(
    //   checkGameSettingsParameters,
    //   gameSettingsParameters,
    //   gameSettingsGroups,
    //   gameSettingsFiles,
    // );

    const totalGameSettingsOptions: SagaReturnType<typeof generateGameSettingsOptionsSaga> = yield call(
      generateGameSettingsOptionsSaga,
      settingsConfig.gameSettingsFiles,
      settingsConfig.gameSettingsParameters,
      moProfile,
    );

    if (Object.keys(totalGameSettingsOptions).length === 0 && errors.length > 0) {
      yield put(addMessages([CreateUserMessage.error('Нет доступных опций для вывода. Ни один параметр из массива "gameSettingsParameters" в файле игровых настроек settings.json не может быть обработан из-за ошибок. Подробности в файле лога.')])); //eslint-disable-line max-len
    } else if (
      // Object.keys(newGameSettingsFilesObj).length !== Object.keys(gameSettingsFiles).length
      // || Object.keys(incorrectGameSettingsFiles).length > 0
      // || errors.length > 0
      errors.length > 0
    ) {
      yield put(addMessages([CreateUserMessage.warning('Обнаружены ошибки в файле игровых настроек settings.json. Некоторые опции будут недоступны. Подробности в файле лога.')])); //eslint-disable-line max-len
    }

    yield put(setGameSettingsOptions(totalGameSettingsOptions));
    yield put(setGameSettingsConfig(settingsConfig));
    // yield put(setGameSettingsFiles(gameSettingsFiles));
    // yield put(setGameSettingsParameters(parameters));
    yield put(setIsGameSettingsLoaded(true));

    if (isLauncherConfigChanged) {
      yield put(setIsLauncherConfigChanged(false));
    }

    writeToLogFileSync('Game settings initialisation completed.');
  } catch (error: any) {
    let errorMessage = '';

    if (error instanceof SagaError) {
      errorMessage = `Error in "${error.sagaName}". ${error.message}`;
    } else if (error instanceof CustomError) {
      errorMessage = `${error.message}`;
    } else if (error instanceof ReadWriteError) {
      errorMessage = `${error.message}. Path "${error.path}".`;
    } else {
      errorMessage = `Unknown error. Message: ${error.message}`;
    }

    if (!isFromUpdateAction) {
      writeToLogFileSync(
        `Failed to initialize game settings. Reason: ${errorMessage}`,
        LogMessageType.ERROR,
      );

      yield put(addMessages([CreateUserMessage.error('Произошла ошибка в процессе генерации игровых настроек. Подробности в файле лога.')]));//eslint-disable-line max-len
    }

    yield put(setGameSettingsOptions({}));
    yield put(setGameSettingsFiles([]));
    yield put(setGameSettingsParameters([]));
    yield put(setIsGameSettingsLoaded(false));

    if (isFromUpdateAction) {
      throw new SagaError('Init game settings', errorMessage);
    }
  } finally {
    yield put(setIsGameSettingsLoading(false));
  }
}

/**
 * Изменяет текущий профиль Mod Organizer на другой, записывая изменения в файл.
 * @param newMOProfile Имя профиля.
*/
function* changeMOProfileSaga(
  { payload: newMOProfile }: ReturnType<typeof changeMoProfile>,
): SagaIterator {
  try {
    yield put(setIsGameSettingsLoaded(false));

    const {
      gameSettings: {
        gameSettingsFiles, gameSettingsParameters, gameSettingsOptions,
      },
      main: {
        config: {
          modOrganizer: {
            profileSection,
            profileParam,
            version,
          },
        },
        pathVariables,
      },
    }: ReturnType<typeof getState> = yield select(getState);

    const iniData: IUnwrap<typeof readINIFile> = yield call(
      readINIFile,
      pathVariables['%MO_INI%'],
    );

    changeSectionalIniParameter(
      iniData,
      profileSection,
      profileParam,
      ///TODO Переделать на поддержку кастомного RegExp
      version === 1 ? newMOProfile : `@ByteArray(${newMOProfile})`,
    );

    yield call(
      writeINIFile,
      pathVariables['%MO_INI%'],
      iniData,
      Encoding.WIN1251,
    );

    // const MOProfileGameSettingsOnly = Object.keys(gameSettingsFiles)
    //   .reduce<IGameSettingsFile[]>((acc, curr) => {
    //     if (new RegExp(PathRegExp.MO_PROFILE).test(gameSettingsFiles[curr].path)) {
    //       return {
    //         ...acc,
    //         [curr]: {
    //           ...gameSettingsFiles[curr],
    //         },
    //       };
    //     }

    //     return { ...acc };
    //   }, {});

    const MOProfileGameSettingsOnly = gameSettingsFiles.filter((file) => PathRegExp.MO_PROFILE.test(file.path));
    const availableFileNames = MOProfileGameSettingsOnly.map((file) => file.name);
    const filteredGameSettingParameters = gameSettingsParameters.filter((parameter) => availableFileNames.includes(parameter.file));

    // .reduce<IGameSettingsFile[]>((acc, curr) => {
    //   if (new RegExp(PathRegExp.MO_PROFILE).test(gameSettingsFiles[curr].path)) {
    //     return {
    //       ...acc,
    //       [curr]: {
    //         ...gameSettingsFiles[curr],
    //       },
    //     };
    //   }

    //   return { ...acc };
    // }, {});

    const totalGameSettingsOptions: SagaReturnType<typeof generateGameSettingsOptionsSaga> = yield call(
      generateGameSettingsOptionsSaga,
      MOProfileGameSettingsOnly,
      filteredGameSettingParameters,
      newMOProfile,
    );

    yield put(setMoProfile(newMOProfile));
    yield put(setGameSettingsOptions({
      ...gameSettingsOptions,
      ...totalGameSettingsOptions,
    }));
  } catch (error: any) {
    let errorMessage = '';

    if (error instanceof SagaError) {
      errorMessage = `Error in "${error.sagaName}". ${error.message}`;
    } else if (error instanceof CustomError) {
      errorMessage = `${error.message}`;
    } else if (error instanceof ReadWriteError) {
      errorMessage = `${error.message}. Path '${error.path}'.`;
    } else {
      errorMessage = `Unknown error. Message: ${error.message}`;
    }

    writeToLogFileSync(
      `Failed to change current Mod Organizer profile . Reason: ${errorMessage}`,
      LogMessageType.ERROR,
    );

    yield put(addMessages([CreateUserMessage.error('Произошла ошибка при изменении профиля Mod Organizer. Подробности в файле лога.')]));//eslint-disable-line max-len
  } finally {
    yield put(setIsGameSettingsLoaded(true));
  }
}

/**
 * Сохранить изменения в файлах игровых настроек.
 * @param changedGameSettingsOptions Измененные опции параметров из файлов.
*/
function* saveGameSettingsFilesSaga(
  { payload: changedGameSettingsOptions }: ReturnType<typeof saveGameSettingsFiles>,
): SagaIterator {
  try {
    yield put(setIsGameSettingsSaving(true));

    const {
      gameSettings: {
        moProfile, gameSettingsFiles, gameSettingsOptions, baseFilesEncoding,
      },
      main: { pathVariables },
    }: ReturnType<typeof getState> = yield select(getState);
    const changedFilesNames = Object.keys(changedGameSettingsOptions);

    // const changedGameSettingsFiles = Object.keys(gameSettingsFiles)
    //   .reduce<IGameSettingsFile[]>((acc, fileName) => {
    //     if (changedFilesNames.includes(fileName)) {
    //       return {
    //         ...acc,
    //         [fileName]: gameSettingsFiles[fileName],
    //       };
    //     }

    //     return { ...acc };
    //   }, {});
    const changedGameSettingsFiles = gameSettingsFiles.filter((file) => changedFilesNames.includes(file.name));
    // .reduce<IGameSettingsFile[]>((acc, fileName) => {
    //   if (changedFilesNames.includes(fileName)) {
    //     return {
    //       ...acc,
    //       [fileName]: gameSettingsFiles[fileName],
    //     };
    //   }

    //   return { ...acc };
    // }, {});

    const currentFilesData: SagaReturnType<typeof getDataFromGameSettingsFilesSaga> = yield call(
      getDataFromGameSettingsFilesSaga,
      changedGameSettingsFiles,
      moProfile,
      true,
    );

    const filesForWrite = changedGameSettingsFiles.map((file) => {
      const changedGameSettingsOptionsNames = Object.keys(changedGameSettingsOptions[file.name]);
      const currWriteFileData = currentFilesData[file.name];
      const currWriteFileView = changedGameSettingsFiles.find((currFile) => file.name === currFile.name)!.view;

      changedGameSettingsOptionsNames.forEach((optionName) => {
        if (
          currWriteFileView === GameSettingsFileView.SECTIONAL
          && isDataFromIniFile(currWriteFileView, currWriteFileData)
        ) {
          const parameterNameParts = optionName.split('/');
          changeSectionalIniParameter(
            currWriteFileData,
            parameterNameParts[0],
            parameterNameParts[1],
            changedGameSettingsOptions[file.name][optionName].value,
          );
        } else if (
          currWriteFileView === GameSettingsFileView.LINE
          && isDataFromIniFile(currWriteFileView, currWriteFileData)
        ) {
          currWriteFileData.globals.lines.some((line) => {
            if (getParameterRegExp(optionName).test(line.text)) {
              line.text = line.text.replace(//eslint-disable-line no-param-reassign
                getStringPartFromIniLineParameterForReplace(line.text, optionName),
                `set ${optionName} to ${changedGameSettingsOptions[file.name][optionName].value}`,
              );

              return true;
            }

            return false;
          });
        } else if (
          currWriteFileView === GameSettingsFileView.TAG
          && !isDataFromIniFile(currWriteFileView, currWriteFileData)
        ) {
          const pathArr = [...optionName.split('/')];

          if (pathArr[pathArr.length - 1] !== '#text') {
            pathArr[pathArr.length - 1] = `${xmlAttributePrefix}${pathArr[pathArr.length - 1]}`;
          }

          setValueForObjectDeepKey(
            currWriteFileData,
            pathArr,
            changedGameSettingsOptions[file.name][optionName].value,
          );
        }
      });

      return { [file.name]: currWriteFileData };
    });

    yield all(
      filesForWrite.map((file) => {
        const fileName = Object.keys(file)[0];

        return call(
          writeGameSettingsFile,
          getPathToFile(changedGameSettingsFiles[fileName].path, pathVariables, moProfile),
          file[fileName],
          changedGameSettingsFiles[fileName].view,
          changedGameSettingsFiles[fileName].encoding || baseFilesEncoding,
        );
      }),
    );

    const newChangedGameoptions = changedFilesNames.reduce<IGameSettingsOptions>(
      (totalOptions, fileName) => {
        const fileOtions = {
          ...gameSettingsOptions[fileName],
          ...getGameSettingsOptionsWithDefaultValues(changedGameSettingsOptions, false)[fileName],
        };

        return {
          ...totalOptions,
          [fileName]: fileOtions,
        };
      },
      {},
    );

    const newGameOptions = {
      ...gameSettingsOptions,
      ...newChangedGameoptions,
    };

    yield put(setGameSettingsOptions(newGameOptions));
    yield put(addMessages([CreateUserMessage.success('Настройки успешно сохранены.')]));
  } catch (error: any) {
    let errorMessage = '';

    if (error instanceof SagaError) {
      errorMessage = `Error in "${error.sagaName}". ${error.message}`;
    } else if (error instanceof CustomError) {
      errorMessage = `${error.message}`;
    } else if (error instanceof ReadWriteError) {
      errorMessage = `${error.message}. Path '${error.path}'.`;
    } else {
      errorMessage = `Unknown error. Message: ${error.message}`;
    }

    writeToLogFileSync(
      `Failed to save game settings. Reason: ${errorMessage}`,
      LogMessageType.ERROR,
    );

    yield put(addMessages([CreateUserMessage.error('Произошла ошибка в процессе сохранения игровых настроек. Подробности в файле лога.')]));//eslint-disable-line max-len
  } finally {
    yield put(setIsGameSettingsSaving(false));
  }
}

export default function* gameSetingsSaga(): SagaIterator {
  yield takeLatest(GAME_SETTINGS_TYPES.CHANGE_MO_PROFILE, changeMOProfileSaga);
  yield takeLatest(GAME_SETTINGS_TYPES.SAVE_GAME_SETTINGS_FILES, saveGameSettingsFilesSaga);
}
