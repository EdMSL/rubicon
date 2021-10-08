import React, {
  useEffect, useCallback, useState,
} from 'react';
import {
  Switch,
  Route,
} from 'react-router-dom';

import styles from './styles.module.scss';
import { Routes } from '$constants/routes';
import { MainScreen } from '$containers/MainScreen';
import { GameSettingsScreen } from '$containers/GameSettingsScreen';
import { Messages } from '$containers/Messages';
import { Header } from '$components/Header';
import { useAppSelector } from '$store/store';
import { Modal } from '$components/UI/Modal';
import { AppInfo } from '$components/AppInfo';

export const App = (): JSX.Element => {
  const userTheme = useAppSelector((state) => state.userSettings.theme);

  const [isOpenAppInfo, setIsOpenAppInfo] = useState<boolean>(false);

  useEffect(() => {
    document
      .getElementById('theme')?.setAttribute(
        'href',
        userTheme === '' ? 'css/styles.css' : `../../../themes/${userTheme}/styles.css`,
      );
    // Служит для загрузки стилей пользователя при запуске приложения.
    // Дальше изменение стилей идет через UI. Поэтому у useEffect нет заваисимостей.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openAppInfo = useCallback(() => {
    if (isOpenAppInfo) {
      return;
    }

    setIsOpenAppInfo(true);
  }, [isOpenAppInfo]);

  const onCloseAppInfoModal = useCallback(() => {
    setIsOpenAppInfo(false);
  }, []);

  return (
    <div className={styles.app}>
      <Header openAppInfo={openAppInfo} />
      <Switch>
        <Route
          exact
          path={Routes.MAIN_SCREEN}
          component={MainScreen}
        />
        <Route
          path={Routes.GAME_SETTINGS_SCREEN}
          component={GameSettingsScreen}
        />
      </Switch>
      <Messages />
      {
        isOpenAppInfo && (
          <Modal onCloseBtnClick={onCloseAppInfoModal}>
            <AppInfo />
          </Modal>
        )
      }
    </div>
  );
};
