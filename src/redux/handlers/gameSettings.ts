import { IActionHandler } from '$constants/interfaces';
import { GAME_SETTINGS_TYPES } from '$types/gameSettings';
import { IGameSettingsRootState } from '$reducers/gameSettings'; //eslint-disable-line import/no-cycle, max-len
import * as GAME_SETTINGS_ACTIONS from '$actions/gameSettings'; //eslint-disable-line import/no-cycle, max-len

const setSettingsGroups: IActionHandler<
  IGameSettingsRootState,
  typeof GAME_SETTINGS_ACTIONS.setSettingsGroups
> = (
  state,
  { payload: settingsGroups },
) => ({
  ...state,
  settingsGroups,
});

export const GAME_SETTINGS_HANDLERS = {
  [GAME_SETTINGS_TYPES.SET_SETTINGS_GROUPS]: setSettingsGroups,
};
