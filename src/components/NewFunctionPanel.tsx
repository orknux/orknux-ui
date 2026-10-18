import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RefObject } from 'react';

import { NEW_FUNCTION_NAME } from '../api/functions';
import { NameDialog } from './NameDialog';
import { t } from '../i18n';

export interface NewFunctionPanelProps {
  open: boolean;
  /** Something inside the form it is opened from, so it can stand beside that form. */
  anchor: RefObject<HTMLElement | null>;
  /** What the function will be made as, in one line: what it takes, returns or says. */
  message: string;
  onClose: () => void;
  /** Makes the function; throwing - a name already taken - keeps the panel open with the reason. */
  onCreate: (name: string, description: string) => Promise<void>;
}

/**
 * "+ New function", asked for beside the form rather than inside it.
 *
 * The picker used to turn into a name box with a note under it, and the
 * function was only made when the whole form was saved - so it could not be
 * opened until then, and a taken name was refused by the form, under fields
 * that had nothing to do with it. This is the workflow editor's way of making
 * the thing a node points at, a [NameDialog] standing down the side: Name and
 * Description, made on Create, then chosen in the picker like any other.
 *
 * Where it stands is read off the form when it opens. In the workflow editor's
 * node panel it stands to that panel's left, as the editor's other panels do;
 * inside a drawer - a definition opened from a node - to that drawer's left.
 * Inside a modal it is a modal too, since a panel outside a modal cannot be
 * pressed. On a page of its own - the action, condition or trigger page - it is
 * the dialog the list pages name new things in: the form fills the width there,
 * and a drawer at the edge covered the picker it was opened from.
 */
export function NewFunctionPanel({ open, anchor, message, onClose, onCreate }: NewFunctionPanelProps) {
  const [where, setWhere] = useState<{ placement: 'modal' | 'panel'; besideRight?: number }>({ placement: 'panel' });
  /*
   * Opened only once where it stands is known: the dialog is shown as a modal
   * or a panel at the moment it opens, so deciding afterwards would be too late.
   */
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const host = anchor.current?.closest('dialog');
    // The workflow editor says how wide its node panel is drawn; nothing else does.
    const besideNode = getComputedStyle(document.documentElement).getPropertyValue('--node-panel-width').trim() !== '';
    if (host != null && host.open && host.matches(':modal')) setWhere({ placement: 'modal' });
    else if (host != null && host.open) setWhere({ placement: 'panel', besideRight: window.innerWidth - host.getBoundingClientRect().left });
    else if (besideNode) setWhere({ placement: 'panel' });
    // A page of its own fills the width, and a drawer at its edge would cover the very picker that opened it.
    else setWhere({ placement: 'modal' });
    setShown(true);
  }, [open, anchor]);

  /*
   * Out of the form it is opened from: the panel is a form of its own, and a
   * form inside a form is not one - Create would have submitted the outer.
   */
  return createPortal(
    <NameDialog
      placement={where.placement}
      besideRight={where.besideRight}
      open={shown}
      title={t('New Function')}
      message={message}
      nameLabel={t('Name')}
      namePlaceholder={NEW_FUNCTION_NAME}
      initialName={NEW_FUNCTION_NAME}
      descriptionPlaceholder={t('What it does, in a sentence')}
      submitLabel={t('Create Function')}
      onClose={onClose}
      onSubmit={onCreate}
    />,
    document.body,
  );
}
