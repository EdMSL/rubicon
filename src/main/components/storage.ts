import Storage from 'electron-store';
import { Store } from 'redux';
import path from 'path';

import { configureStore, IAppState } from '$store/store';
import { IUserSettingsRootState } from '$types/userSettings';
import { defaultLauncherConfig } from '$constants/defaultParameters';
import {
  LogMessageType,
  writeToLogFile,
  writeToLogFileSync,
} from '$utils/log';
import { readJSONFileSync, writeJSONFile } from '$utils/files';
import {
  CONFIG_FILE_PATH, DOCUMENTS_DIR, GAME_DIR,
} from '$constants/paths';
import { ISystemRootState } from '$types/system';
import {
  CustomError,
  ErrorName, ReadWriteError, showMessageBox,
} from '$utils/errors';
import { Scope } from '$constants/misc';
import { checkConfigFileData } from '$utils/check';
import { getPathToFile } from '$utils/strings';

interface IStorage {
  userSettings: IUserSettingsRootState,
}

interface ICustomPaths {
  '%GAMEDIR%': string,
  //@ts-ignore
  '%DOCUMENTS%'?: string|undefined,
  //@ts-ignore
  '%MO%'?: string|undefined,
  [label: string]: string,
}

const saveToStorageParams = ['userSettings'];

const getConfigurationData = (): ISystemRootState => {
  // Считываем данные из файла конфигурации лаунчера. Эти данные затем передаются в стейт Redux.
  // Если файл не найден, то создаем новый с дефолтными настройками.
  try {
    let configData = readJSONFileSync<ISystemRootState>(CONFIG_FILE_PATH);
    configData = checkConfigFileData(configData);

    return configData;
  } catch (error: any) {
    if (error instanceof ReadWriteError) {
      if (error.cause.name === ErrorName.NOT_FOUND) {
        writeToLogFileSync(
          'Launcher config file not found. Load default values. A new config file will be created', //eslint-disable-line max-len
          LogMessageType.WARNING,
        );

        showMessageBox(
          'Will be loaded default values. A new config file will be created',
          'Launcher config file not found',
          'warning',
        );

        writeJSONFile(CONFIG_FILE_PATH, defaultLauncherConfig)
          .then(() => {
            writeToLogFile('New config file config.json successfully created.');
          })
          .catch(() => {
            writeToLogFile('New config file config.json not created.', LogMessageType.WARNING);
          });

        return defaultLauncherConfig;
      }

      throw new Error('Found problems with config.json.');
    } else if (error instanceof CustomError) {
      if (error.name === ErrorName.VALIDATION) {
        writeToLogFileSync(error.message, LogMessageType.ERROR);
      }
    }

    throw new Error('Found problems with config.json.');
  }
};

/**
 * Генерация пользовательских путей с добавлением двух по умолчанию: для папки
 * игры в документах пользователя
 * и папки профилей Mod Organizer, если он используется.
 * @param configData Данные из файла config.json
 * @returns Объект с пользовательскими путями.
*/
const createCustomPaths = (configData: ISystemRootState): ICustomPaths => {
  const newCustomPaths = Object.keys(configData.customPaths).reduce((paths, currentPathKey) => ({
    ...paths,
    [currentPathKey]: path.join(GAME_DIR, configData.customPaths[currentPathKey]),
  }), {});

  return {
    '%DOCUMENTS%': path.join(DOCUMENTS_DIR, configData.documentsPath),
    '%GAMEDIR%': GAME_DIR,
    ...configData.modOrganizer.isUsed ? {
      '%MO%': path.join(GAME_DIR, configData.modOrganizer.pathToProfiles),
    } : {},
    ...newCustomPaths,
  };
};

/**
  * Функция для создания файла настроек пользователя и хранилища Redux.
*/
export const createStorage = (): Store<IAppState> => {
  const configurationData = getConfigurationData();

  // Создаем хранилаще пользовательских настроек (настройки темы и т.п.).
  // Хранилище располагается в файле config.json в папке AppData/ (app.getPath('userData')).
  const storage = new Storage<IStorage>({
    defaults: {
      userSettings: {
        theme: '',
      },
    },
  });

  const userSettings = storage.get('userSettings');
  const customPaths = createCustomPaths(configurationData);

  configurationData.playButton.path = getPathToFile(configurationData.playButton.path, customPaths, '');

  if (!configurationData.playButton.label) {
    configurationData.playButton.label = defaultLauncherConfig.playButton.label;
  }

  if (configurationData.customButtons.length > 0) {
    const newButtons = configurationData.customButtons.map((btn) => ({
      ...btn,
      path: getPathToFile(btn.path, customPaths, ''),
    }));

    //@ts-ignore
    configurationData.customButtons = newButtons;
  }

  const newStore = {
    userSettings,
    system: {
      ...defaultLauncherConfig,
      ...configurationData,
      customPaths: { ...customPaths },
    },
  };

  /* eslint-disable @typescript-eslint/dot-notation */
  global['state'] = newStore;

  const appStore = configureStore(newStore, Scope.MAIN).store;

  appStore.subscribe(() => {
    const currentState = appStore.getState();
    const newStorageData = Object.keys(currentState).reduce((currentParams, param) => {
      if (saveToStorageParams.includes(param)) {
        return {
          ...currentParams,
          [param]: currentState[param],
        };
      }

      return { ...currentParams };
    }, {});

    storage.set(newStorageData);
  });

  writeToLogFileSync(`Working directory: ${GAME_DIR}`);
  writeToLogFileSync(`Custom paths: ${customPaths}`);

  if (configurationData.modOrganizer.isUsed) {
    writeToLogFileSync(`MO information.\n  Path: ${configurationData.modOrganizer.path}\n  Path to INI: ${configurationData.modOrganizer.pathToINI}\n  Path to profiles: ${configurationData.modOrganizer.pathToProfiles}\n  Profile parameter on INI: ${configurationData.modOrganizer.profileParam}\n  Profile parameter regExp: ${configurationData.modOrganizer.profileParamValueRegExp}`); //eslint-disable-line max-len
  }

  return appStore;
};
