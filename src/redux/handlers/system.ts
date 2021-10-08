import { IActionHandler } from '$types/common';
import { SYSTEM_TYPES, ISystemRootState } from '$types/system';
import * as SYSTEM_ACTIONS from '$actions/system';

type ISystemActionHadler<P> = IActionHandler<ISystemRootState, P>;

const setIsFirstLaunch: ISystemActionHadler<
  typeof SYSTEM_ACTIONS.setIsFirstLaunch
> = (
  state,
  { payload: isFirstLaunch },
) => ({
  ...state,
  isFirstLaunch,
});

export const SYSTEM_HANDLERS = {
  [SYSTEM_TYPES.SET_IS_FIRST_LAUNCH]: setIsFirstLaunch,
};
