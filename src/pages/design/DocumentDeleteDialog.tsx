import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { deleteDocument, fetchDocumentMentions } from '../../api/documents';
import type { DocumentReference } from '../../api/documents';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { t } from '../../i18n';

export interface DocumentDeleteDialogProps {
  workspaceId: string;
  /** The document to delete, or null while nothing is being deleted. */
  document: { id: string; name: string } | null;
  onClose: () => void;
  /** After it is gone. */
  onDeleted: () => void | Promise<void>;
}

/**
 * Deleting a document, asked first - from its list and from its editor alike.
 * Where other documents link to it they are named, each a link to open in a
 * tab of its own, so the links that will break can be looked at before they do.
 */
export function DocumentDeleteDialog({ workspaceId, document, onClose, onDeleted }: DocumentDeleteDialogProps) {
  const [mentions, setMentions] = useState<DocumentReference[] | null>(null);

  useEffect(() => {
    setMentions(null);
    if (document === null) return undefined;
    let live = true;
    fetchDocumentMentions(document.id)
      .then((found) => live && setMentions(found))
      .catch(() => live && setMentions([]));
    return () => {
      live = false;
    };
  }, [document]);

  return (
    <ConfirmDialog
      subject={document?.name ?? null}
      kind="removeDocument"
      detail={
        mentions !== null && mentions.length > 0 ? (
          <span data-testid="document-delete-mentioned">
            {t('Mentioned by')}{' '}
            {mentions.map((one, at) => (
              <span key={one.id}>
                {at > 0 && ', '}
                <Link to={`/workspace/${workspaceId}/design/documents/${one.id}`} target="_blank" rel="noopener" data-testid="document-delete-mention">
                  {one.name}
                </Link>
              </span>
            ))}
          </span>
        ) : undefined
      }
      onClose={onClose}
      onConfirm={async () => {
        if (document === null) return;
        await deleteDocument(document.id);
        onClose();
        await onDeleted();
      }}
    />
  );
}
