import { IActionHandler } from '$types/common';
import { GAME_SETTINGS_TYPES, IGameSettingsRootState } from '$types/gameSettings';
import * as GAME_SETTINGS_ACTIONS from '$actions/gameSettings';

const setGameSettingsConfig: IActionHandler<
  IGameSettingsRootState,
  typeof GAME_SETTINGS_ACTIONS.setGameSettingsConfig
> = (
  state,
  { payload: gameSettingsConfig },
) => ({
  ...state,
  ...gameSettingsConfig,
});

const setGameSettingsUsedFiles: IActionHandler<
  IGameSettingsRootState,
  typeof GAME_SETTINGS_ACTIONS.setGameSettingsUsedFiles
> = (
  state,
  { payload: gameSettingsUsedFiles },
) => ({
  ...state,
  usedFiles: gameSettingsUsedFiles,
});

const setMoProfile: IActionHandler<
  IGameSettingsRootState,
  typeof GAME_SETTINGS_ACTIONS.setMoProfile
> = (
  state,
  { payload: moProfile },
) => ({
  ...state,
  moProfile,
});

export const GAME_SETTINGS_HANDLERS = {
  [GAME_SETTINGS_TYPES.SET_GAME_SETTINGS_CONFIG]: setGameSettingsConfig,
  [GAME_SETTINGS_TYPES.SET_GAME_SETTINGS_USED_FILES]: setGameSettingsUsedFiles,
  [GAME_SETTINGS_TYPES.SET_MO_PROFILE]: setMoProfile,
};
