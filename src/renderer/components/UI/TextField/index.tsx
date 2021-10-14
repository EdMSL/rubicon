import React from 'react';
import classNames from 'classnames';

import { IUIElementProps } from '$types/gameSettings';
import { GameSettingsHintBlock } from '$components/GameSettingsHintBlock';

interface IProps extends IUIElementProps<HTMLInputElement> {

}

export const TextField: React.FunctionComponent<IProps> = ({
  id,
  label,
  name = id,
  value,
  className = '',
  parentClassname = '',
  description = '',
  currentHintId = '',
  parent = '',
  multiparameters = '',
  isDisabled = false,
  onChange,
  onHover = null,
  onLeave = null,
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
        description
        && onHover
        && onLeave
        && (
          <GameSettingsHintBlock
            id={id}
            currentHintId={currentHintId}
            description={description}
            onHover={onHover}
            onLeave={onLeave}
          />
        )
      }
    </label>
    <input
      className="text-field__input"
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
