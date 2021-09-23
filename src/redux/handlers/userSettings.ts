import { IActionHandler } from '$types/common';
import { USER_SETTINGS_TYPES, IUserSettingsRootState } from '$types/userSettings';
import * as USER_SETTINGS_ACTIONS from '$actions/userSettings';

const setIsAutoclose: IActionHandler<
  IUserSettingsRootState,
  typeof USER_SETTINGS_ACTIONS.setIsAutoclose
> = (
  state,
  { payload: isAutoclose },
) => ({
  ...state,
  isAutoclose,
});

const setUserTheme: IActionHandler<
  IUserSettingsRootState,
  typeof USER_SETTINGS_ACTIONS.setUserTheme
> = (
  state,
  { payload: theme },
) => ({
  ...state,
  theme,
});

export const USER_SETTINGS_HANDLERS = {
  [USER_SETTINGS_TYPES.SET_IS_AUTOCLOSE]: setIsAutoclose,
  [USER_SETTINGS_TYPES.SET_USER_THEME]: setUserTheme,
};
