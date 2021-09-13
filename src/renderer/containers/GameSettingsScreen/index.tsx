import React, { useCallback, useState } from 'react';
import {
  Switch, Route, NavLink,
} from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';

import styles from './styles.module.scss';
import { Routes } from '$constants/routes';
import { IAppState } from '$store/store';
import {
  generateSelectOptions, getChangedGameSettingsOptions, getGameSettingsOptionsWithDefaultValues,
} from '$utils/data';
import { GameSettingsContent } from '$components/GameSettingsContent';
import { Select } from '$components/UI/Select';
import {
  changeGameSettingsOption,
  changeMoProfile,
  saveGameSettingsFiles,
  setGameSettingsOptions,
} from '$actions/gameSettings';
import { IGameSettingsOptionsItem } from '$types/gameSettings';
import { Loader } from '$components/UI/Loader';
import { GameSettingsFormControls } from '$components/GameSettingsFormControls';

/**
 * Контейнер, в котором располагаются блок (`GameSettingsContent`) с контроллерами для изменения
 * игровых настроек и селектор выбора профиля Mod Organizer (если МО используется).
*/
export const GameSettingsScreen: React.FC = () => {
  const isGameSettingsLoaded = useSelector((state: IAppState) => state.main.isGameSettingsLoaded);
  const isGameSettingsFilesBackuping = useSelector((state: IAppState) => state.main.isGameSettingsFilesBackuping); //eslint-disable-line max-len
  const isGameSettingsSaving = useSelector((state: IAppState) => state.main.isGameSettingsSaving);
  const gameSettingsFiles = useSelector((state: IAppState) => state.gameSettings.gameSettingsFiles);
  const gameSettingsGroups = useSelector((state: IAppState) => state.gameSettings.gameSettingsGroups); //eslint-disable-line max-len
  const gameSettingsOptions = useSelector((state: IAppState) => state.gameSettings.gameSettingsOptions); //eslint-disable-line max-len
  const moProfile = useSelector((state: IAppState) => state.gameSettings.moProfile);
  const moProfiles = useSelector((state: IAppState) => state.gameSettings.moProfiles);
  const isModOrganizerUsed = useSelector((state: IAppState) => state.system.modOrganizer.isUsed);

  const dispatch = useDispatch();

  const [isGameOptionsChanged, setIsGameOptionsChanged] = useState<boolean>(false);

  const onMOProfilesSelectChange = useCallback(
    ({ target }: React.ChangeEvent<HTMLSelectElement>) => {
      dispatch(changeMoProfile(target.value));
    }, [dispatch],
  );

  const onSettingOptionChange = useCallback((
    parent: string,
    options: IGameSettingsOptionsItem,
  ) => {
    dispatch(changeGameSettingsOption(parent, options));
  }, [dispatch]);

  const onGameSettingsFormSubmit = useCallback((event) => {
    event.preventDefault();

    if (isGameOptionsChanged) {
      dispatch(saveGameSettingsFiles(getChangedGameSettingsOptions(gameSettingsOptions)));
    }
  }, [dispatch, gameSettingsOptions, isGameOptionsChanged]);

  const onCancelSettingsBtnClick = useCallback(() => {
    dispatch(setGameSettingsOptions(getGameSettingsOptionsWithDefaultValues(gameSettingsOptions)));
    setIsGameOptionsChanged(false);
  }, [dispatch, gameSettingsOptions]);

  ///TODO Пересмотреть механиз отслеживания изменения параметров для кнопок
  const getIsSaveResetSettingsButtonsDisabled = useCallback(() => {
    if (
      Object.keys(getChangedGameSettingsOptions(gameSettingsOptions)).length > 0
      && !isGameSettingsFilesBackuping
    ) {
      if (!isGameOptionsChanged) {
        setIsGameOptionsChanged(true);
      }
      return false;
    }

    return true;
  },
  [gameSettingsOptions, isGameOptionsChanged, isGameSettingsFilesBackuping]);

  const onCreateBackupBtnClick = useCallback(() => {
    // dispatch(createIniBackup());
  }, [/* dispatch */]);

  return (
    <main className={classNames('main', styles['game-settings-screen__main'])}>
      <div className={classNames('control-panel', styles['game-settings-screen__navigation'])}>
        {
          gameSettingsGroups.map((group) => (
            <NavLink
              key={group.name}
              className="control-panel__btn"
              activeClassName={styles['control-panel__btn--active']}
              to={`${Routes.GAME_SETTINGS_SCREEN}/${group.name}`}
            >
              {group.label}
            </NavLink>
          ))
            }
        <NavLink
          exact
          to={Routes.MAIN_SCREEN}
          className="control-panel__btn"
        >
          Назад
        </NavLink>
      </div>
      <div className={classNames('content', styles['game-settings-screen__content'])}>
        {
        isModOrganizerUsed
        && moProfile
        && moProfiles.length > 0
        && gameSettingsOptions
        && isGameSettingsLoaded
        && (
          <div className={styles['game-settings-screen__profiles']}>
            <Select
              className={styles['game-settings-screen__select']}
              id="profiles-select"
              label="Выберите профиль Mod Organizer"
              value={moProfile}
              optionsArr={generateSelectOptions(moProfiles)}
              onChange={onMOProfilesSelectChange}
            />
          </div>
        )
        }
        {
          isGameSettingsLoaded && Object.keys(gameSettingsOptions).length > 0 && (
            <form
              className={styles['game-settings-screen']}
              onSubmit={onGameSettingsFormSubmit}
            >
              <div className={styles['game-settings-screen__options']}>
                <Switch>
                  <Route
                    path={gameSettingsGroups.length > 0
                      ? `${Routes.GAME_SETTINGS_SCREEN}/:settingGroup/`
                      : Routes.GAME_SETTINGS_SCREEN}
                    render={(): React.ReactElement => (
                      <React.Fragment>
                        <GameSettingsContent
                          gameSettingsOptions={gameSettingsOptions}
                          gameSettingsFiles={gameSettingsFiles}
                          gameSettingsGroups={gameSettingsGroups}
                          onSettingOptionChange={onSettingOptionChange}
                        />
                      </React.Fragment>
                    )}
                  />
                </Switch>
              </div>
              <GameSettingsFormControls
                isGameOptionsChanged={getIsSaveResetSettingsButtonsDisabled()}
                isBackuping={isGameSettingsFilesBackuping}
                isSaving={isGameSettingsSaving}
                onCancelSettingsBtnClick={onCancelSettingsBtnClick}
                onCreateBackupBtnClick={onCreateBackupBtnClick}
              />
            </form>
          )
          }
        {
          !isGameSettingsLoaded && <Loader />
        }
      </div>
    </main>
  );
};
