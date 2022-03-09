import React, {
  ReactElement, useCallback, useMemo, useState,
} from 'react';
import Scrollbars from 'react-custom-scrollbars-2';

import styles from './styles.module.scss';
import { DeveloperScreenController } from '$components/DeveloperScreenController';
import { IValidationErrors } from '$types/common';
import { useAppSelector } from '$store/store';
import { IGameSettingsConfig, IGameSettingsGroup } from '$types/gameSettings';
import { getNewConfig } from '$utils/data';
import { GroupItemCreator } from '$components/GroupItemCreator';
import { checkObjectForEqual } from '$utils/check';

export const DeveloperScreenGameSettings: React.FC = () => {
  const gameSettingsFiles = useAppSelector((state) => state.gameSettings.gameSettingsFiles);
  const gameSettingsGroups = useAppSelector((state) => state.gameSettings.gameSettingsGroups);
  const baseFilesEncoding = useAppSelector((state) => state.gameSettings.baseFilesEncoding);
  const isFirstLaunch = useAppSelector((state) => state.main.config.isFirstLaunch);

  const settingsConfig: IGameSettingsConfig = useMemo(() => ({
    gameSettingsGroups,
    baseFilesEncoding,
    gameSettingsFiles,
  }), [gameSettingsGroups, baseFilesEncoding, gameSettingsFiles]);

  const [currentSettingsConfig, setCurrentSettingsConfig] = useState<IGameSettingsConfig>(settingsConfig);
  const [validationErrors, setValidationErrors] = useState<IValidationErrors>({});
  const [isConfigChanged, setIsConfigChanged] = useState<boolean>(false);

  const changeCurrentConfig = useCallback((value, fieldName: string, parent?: string) => {
    const newConfig = getNewConfig(currentSettingsConfig, value, fieldName, parent);

    setCurrentSettingsConfig(newConfig);
    setIsConfigChanged(!checkObjectForEqual(settingsConfig, newConfig));
  }, [settingsConfig, currentSettingsConfig]);

  const onSaveBtnClick = useCallback(() => {}, []);
  const onCancelBtnClick = useCallback(() => {}, []);
  const onResetBtnClick = useCallback(() => {
    setIsConfigChanged(false);
    setValidationErrors({});
    setCurrentSettingsConfig(settingsConfig);
  }, [settingsConfig]);

  const createNewGroup = useCallback((group: IGameSettingsGroup) => {
    changeCurrentConfig(
      [...currentSettingsConfig.gameSettingsGroups!, group],
      'gameSettingsGroups',
    );
  }, [currentSettingsConfig, changeCurrentConfig]);

  const onValidationError = useCallback((errors: IValidationErrors) => {
    setValidationErrors(errors);
  }, []);

  /* eslint-disable react/jsx-props-no-spreading */
  return (
    <form
      className="develover-screen__form"
    >
      <DeveloperScreenController
        isConfigChanged={isConfigChanged}
        isHaveValidationErrors={Object.keys(validationErrors).length > 0}
        isFirstLaunch={isFirstLaunch}
        onSaveBtnClick={onSaveBtnClick}
        onCancelBtnClick={onCancelBtnClick}
        onResetBtnClick={onResetBtnClick}
      />
      <Scrollbars
        autoHeight
        autoHide
        autoHeightMax="100%"
        hideTracksWhenNotNeeded
        renderTrackVertical={(props): ReactElement => (
          <div
            {...props}
            className="scrollbar__track"
          />
        )}
        renderThumbVertical={(props): ReactElement => (
          <div
            {...props}
            className="scrollbar__thumb"
          />
        )}
      >
        <div className={styles['developer-screen_game-settings']}>
          <div className="developer-screen__block">
            <p className="developer-screen__block-title">Группы игровых настроек</p>
            <p className="developer-screen__text">Создать группу</p>
            <GroupItemCreator
              className="developer-screen__item"
              validationErrors={validationErrors}
              onApplyNewName={createNewGroup}
              onValidationError={onValidationError}
            />
          </div>
          {
            currentSettingsConfig.gameSettingsGroups!.map((item) => (
              <div>
                <p>{item.name}</p>
                <p>{item.label}</p>
              </div>
            ))
          }
        </div>
      </Scrollbars>
    </form>
  );
};
