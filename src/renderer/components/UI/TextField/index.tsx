import React from 'react';
import classNames from 'classnames';

import { IUIElementProps } from '$types/gameSettings';
import { GameSettingsHintBlock } from '$components/GameSettingsHintBlock';

interface IProps extends IUIElementProps<HTMLInputElement> {
  value: string,
}

export const TextField: React.FunctionComponent<IProps> = ({
  id,
  label,
  name = id,
  value,
  className = '',
  parentClassname = '',
  description = '',
  parent = '',
  multiparameters = '',
  isDisabled = false,
  isValidationError,
  onChange,
}) => (
  <div className={classNames(
    'text-field__container',
    parentClassname && `${parentClassname}-text-field__container`,
    className,
  )}
  >
    <label
      className="text-field__label"
      htmlFor={id}
    >
      <span>{label}</span>
      {
        description && <GameSettingsHintBlock description={description} />
      }
    </label>
    <input
      className={classNames('text-field__input', isValidationError && 'text-field__input--error')}
      type="text"
      id={id}
      name={name}
      value={value}
      data-parent={parent}
      data-multiparameters={multiparameters}
      disabled={isDisabled}
      onChange={onChange}
    />
  </div>
);
