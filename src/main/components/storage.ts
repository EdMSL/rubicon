import Storage from 'electron-store';
import { Store } from 'redux';
import path from 'path';
import { app } from 'electron';

import { configureStore, IAppState } from '$store/store';
import { IUserSettingsRootState } from '$types/userSettings';
import {
  defaultLauncherConfig,
} from '$constants/defaultParameters';
import {
  LogMessageType,
  writeToLogFile,
  writeToLogFileSync,
} from '$utils/log';
import {
  getUserThemesFolders,
  readJSONFileSync,
  writeJSONFile,
} from '$utils/files';
import {
  CONFIG_FILE_PATH,
  GAME_DIR,
  ICustomPaths,
  IDefaultCustomPaths,
} from '$constants/paths';
import {
  CustomError,
  ErrorName,
  ReadWriteError,
  showMessageBox,
} from '$utils/errors';
import { checkConfigFileData } from '$utils/check';
import { getObjectAsList, getPathToFile } from '$utils/strings';
import {
  createCustomPaths,
  getCustomButtons,
  getNewModOrganizerParams,
  getUserThemes,
} from '$utils/data';
import { INITIAL_STATE as mainInitialState } from '$reducers/main';
// import { INITIAL_STATE as configInitialState } from '$reducers/main';
import { INITIAL_STATE as userSettingsInitialState } from '$reducers/userSettings';
import { ILauncherConfig, IUserMessage } from '$types/main';
import { CreateUserMessage } from '$utils/message';
import { Scope } from '$constants/misc';

interface IStorage {
  userSettings: IUserSettingsRootState,
}

const saveToStorageParams = ['userSettings'];

const getConfigurationData = (): ILauncherConfig => {
  // Считываем данные из файла конфигурации лаунчера. Эти данные затем передаются в стейт Redux.
  // Если файл не найден, то создаем новый с дефолтными настройками.
  try {
    const configData = readJSONFileSync<ILauncherConfig>(CONFIG_FILE_PATH);

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
        // writeJSONFile(CONFIG_FILE_PATH, minimalLauncherConfig)
          .then(() => {
            writeToLogFile('New config file config.json successfully created.');
          })
          .catch(() => {
            writeToLogFile('New config file config.json not created.', LogMessageType.WARNING);
          });

        return defaultLauncherConfig;
        // return minimalLauncherConfig;
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
  * Функция для создания файла настроек пользователя и хранилища Redux.
*/
export const createStorage = (): Store<IAppState> => {
  const messages: IUserMessage[] = [];
  const configurationFileData = getConfigurationData();
  const configurationData = checkConfigFileData(configurationFileData);

  // Создаем хранилище пользовательских настроек (настройки темы и т.п.).
  // Хранилище располагается в файле user.json в корне программы.
  const storage = new Storage<IStorage>({
    defaults: {
      userSettings: {
        isAutoclose: false,
        theme: '',
      },
    },
    cwd: process.env.NODE_ENV === 'production' ? path.resolve() : path.resolve('./app/files'),
    name: 'user',
  });

  // Обработка файла user.json
  const userSettingsStorage = storage.get('userSettings');

  const userThemes = getUserThemes(getUserThemesFolders());

  if (Object.keys(userThemes).length === 1 && userSettingsStorage.theme !== '') {
    writeToLogFile(
      'No themes found, but user theme is set in storage. Theme will be set to default.',
      LogMessageType.WARNING,
    );

    // Игнорируем перезапись ReadOnly, т.к. это еще не state.
    //@ts-ignore
    userSettingsStorage.theme = '';
    storage.set('userSettings.theme', '');
  }

  // Обработка данных Mod Organizer
  if (configurationData.modOrganizer?.isUsed) {
    //@ts-ignore
    configurationData.modOrganizer = getNewModOrganizerParams(configurationData.modOrganizer);
  }

  // Переменные путей и настройка кнопок
  const customPaths = createCustomPaths(
    configurationData,
    app,
  );

  const totalCustomPaths: ICustomPaths & IDefaultCustomPaths = {
    ...customPaths.default,
    ...customPaths.custom,
  };

  if (configurationData.playButton?.path) {
    configurationData.playButton.path = getPathToFile(
      configurationData.playButton?.path,
      totalCustomPaths,
      '',
    );
  } else {
    messages.push(CreateUserMessage.warning('Не указан путь для файла запуска игры.')); //eslint-disable-line max-len
  }

  if (!configurationData.playButton?.label) {
    configurationData.playButton.label = defaultLauncherConfig.playButton.label;
  }

  if (configurationData.customButtons && configurationData.customButtons.length > 0) {
    const newButtons = getCustomButtons(configurationData.customButtons, totalCustomPaths);

    if (configurationData.customButtons.length !== newButtons.length) {
      messages.push(CreateUserMessage.warning('В процессе обработки списка пользовательских кнопок возникла ошибка. Не все кнопки будут доступны. Подробности в файле лога.')); //eslint-disable-line max-len
    }

    //@ts-ignore
    configurationData.customButtons = newButtons;
  }

  // Генерация state без gameSettings.
  const newStore = {
    userSettings: {
      ...userSettingsInitialState,
      ...userSettingsStorage,
    },
    main: {
      ...mainInitialState,
      config: {
        ...configurationData,
        modOrganizer: {
          ...mainInitialState.config.modOrganizer,
          ...configurationData.modOrganizer,
        },
        playButton: {
          ...mainInitialState.config.playButton,
          ...configurationData.playButton,
        },
        customPaths: { ...customPaths.custom },
      },
      defaultPaths: { ...customPaths.default },
      userThemes,
      messages,
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
  writeToLogFileSync(`Custom paths: \n${getObjectAsList(customPaths)}`);

  if (configurationFileData.modOrganizer) {
    writeToLogFileSync(`MO information: \n${getObjectAsList(configurationFileData.modOrganizer!)}`);
  }

  return appStore;
};
