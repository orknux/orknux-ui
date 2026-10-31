import { useEffect, useState } from 'react';

import type { SessionUser } from '../../api/session';
import { setChatAvatarShown, setChatCostShown, setMyLanguage, setMyTimeZone, setUserEmail, setUserEmailNotifications } from '../../api/users';
import moonIcon from '../../assets/moon.svg';
import sunIcon from '../../assets/sun.svg';
import { AccessTokens } from '../../components/AccessTokens';
import { AppShell } from '../../components/AppShell';
import { DiscardButton, SaveBar } from '../../components/SaveBar';
import { FieldHint } from '../../components/FieldHint';
import { currentLanguage, LANGUAGE_NAMES, LANGUAGES, setLanguage } from '../../session/language';
import type { Language } from '../../session/language';
import { currentDragEffect, rememberDragEffect } from '../../session/dragEffect';
import type { DragEffect } from '../../session/dragEffect';
import { applyTheme, currentTheme, rememberTheme } from '../../session/theme';
import { ACCENTS, applyAccent, currentAccent, rememberAccent } from '../../session/accent';
import type { Accent } from '../../session/accent';
import { adoptTimeZone, browserTimeZone, chosenTimeZone, timeZones } from '../../session/timeZone';
import type { Theme } from '../../session/theme';
import { shellUser } from '../../session/user';
import {
  DEFAULT_SHORTCUT,
  describe,
  DEFAULT_FORMAT_SHORTCUT,
  DEFAULT_TURN_SHORTCUT,
  DEFAULT_ADD_SHORTCUT,
  DEFAULT_SELECT_SHORTCUT,
  DEFAULT_JOINT_SHORTCUT,
  jointShortcut,
  setJointShortcut,
  useJointShortcut,
  DEFAULT_UNDO_SHORTCUT,
  DEFAULT_REDO_SHORTCUT,
  DEFAULT_DUPLICATE_SHORTCUT,
  DEFAULT_COPY_SHORTCUT,
  DEFAULT_CUT_SHORTCUT,
  DEFAULT_PASTE_SHORTCUT,
  copyShortcut,
  cutShortcut,
  pasteShortcut,
  setCopyShortcut,
  setCutShortcut,
  setPasteShortcut,
  useCopyShortcut,
  useCutShortcut,
  usePasteShortcut,
  DEFAULT_PUBLISH_SHORTCUT,
  DEFAULT_VOICE_MUTE_SHORTCUT,
  DEFAULT_RECENT_SHORTCUT,
  DEFAULT_SAVE_SHORTCUT,
  setFormatShortcut,
  setTurnShortcut,
  setAddShortcut,
  setSelectShortcut,
  setZoomInShortcut,
  setArrangeShortcut,
  setMagicRectangleShortcut,
  setMagicLassoShortcut,
  setMagicAllShortcut,
  setZoomOutShortcut,
  setUndoShortcut,
  setRedoShortcut,
  setDuplicateShortcut,
  setPublishShortcut,
  setVoiceMuteShortcut,
  setPaletteShortcut,
  setRecentShortcut,
  setSaveShortcut,
  usable,
  useFormatShortcut,
  useTurnShortcut,
  useAddShortcut,
  useSelectShortcut,
  useZoomInShortcut,
  useArrangeShortcut,
  useMagicRectangleShortcut,
  useMagicLassoShortcut,
  useMagicAllShortcut,
  useZoomOutShortcut,
  useUndoShortcut,
  useRedoShortcut,
  useDuplicateShortcut,
  usePublishShortcut,
  useVoiceMuteShortcut,
  usePaletteShortcut,
  useRecentShortcut,
  useSaveShortcut,
  paletteShortcut,
  recentShortcut,
  saveShortcut,
  formatShortcut,
  turnShortcut,
  addShortcut,
  selectShortcut,
  zoomInShortcut,
  arrangeShortcut,
  magicRectangleShortcut,
  magicLassoShortcut,
  magicAllShortcut,
  DEFAULT_MAGIC_ALL_SHORTCUT,
  DEFAULT_MAGIC_RECTANGLE_SHORTCUT,
  DEFAULT_MAGIC_LASSO_SHORTCUT,
  zoomOutShortcut,
  DEFAULT_ZOOM_IN_SHORTCUT,
  DEFAULT_ARRANGE_SHORTCUT,
  DEFAULT_ZOOM_OUT_SHORTCUT,
  undoShortcut,
  redoShortcut,
  duplicateShortcut,
  publishShortcut,
  voiceMuteShortcut,
  DEFAULT_NEXT_TAB_SHORTCUT,
  DEFAULT_PREVIOUS_TAB_SHORTCUT,
  nextTabShortcut,
  nextWindowShortcut,
  previousWindowShortcut,
  setNextWindowShortcut,
  setPreviousWindowShortcut,
  useNextWindowShortcut,
  usePreviousWindowShortcut,
  DEFAULT_NEXT_WINDOW_SHORTCUT,
  DEFAULT_PREVIOUS_WINDOW_SHORTCUT,
  previousTabShortcut,
  setNextTabShortcut,
  setPreviousTabShortcut,
  useNextTabShortcut,
  usePreviousTabShortcut,
  DEFAULT_IMAGE_EDITOR_SHORTCUTS,
  IMAGE_EDITOR_SHORTCUTS,
  imageEditorShortcut,
  setImageEditorShortcut,
  useImageEditorShortcuts,
  DEFAULT_FIND_SHORTCUT,
  findShortcut,
  setFindShortcut,
  useFindShortcut,
} from '../../session/shortcut';
import type { ImageEditorShortcut } from '../../session/shortcut';
import { inDesktopApp, recordingKeys } from '../../session/desktop';
import styles from './PreferencesPage.module.css';
import { t, tf } from '../../i18n';
import { Select } from '../../components/Select';

/** The shortcuts this page sets, by the name a draft is kept under. */
type ShortcutKey =
  | 'palette'
  | 'recent'
  | 'save'
  | 'format'
  | 'turn'
  | 'add'
  | 'select'
  | 'joint'
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'publish'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'voiceMute'
  | 'zoomIn'
  | 'zoomOut'
  | 'arrange'
  | 'magicRectangle'
  | 'magicLasso'
  | 'magicAll'
  | 'nextTab'
  | 'previousTab'
  | 'nextWindow'
  | 'previousWindow'
  | 'find'
  | ImageEditorShortcut;

/** Whether a shortcut is one of the image editor's own: heard only on its canvas, so a bare key will do. */
const inImageEditor = (key: string | null): key is ImageEditorShortcut => key !== null && (IMAGE_EDITOR_SHORTCUTS as string[]).includes(key);

/** What Preferences calls each of the image editor's own shortcuts, and what its (?) says. */
function imageEditorLabel(name: ImageEditorShortcut): { label: string; hint: string } {
  switch (name) {
    case 'rotateLeft':
      return { label: t('Rotate Left Shortcut'), hint: t('Turns the picture a quarter to the left in the image editor. Heard only there, never while typing.') };
    case 'rotateRight':
      return { label: t('Rotate Right Shortcut'), hint: t('Turns the picture a quarter to the right in the image editor. Heard only there, never while typing.') };
    case 'flipHorizontal':
      return { label: t('Flip Horizontally Shortcut'), hint: t('Mirrors the picture left for right in the image editor. Heard only there, never while typing.') };
    case 'flipVertical':
      return { label: t('Flip Vertically Shortcut'), hint: t('Mirrors the picture top for bottom in the image editor. Heard only there, never while typing.') };
    case 'brush':
      return { label: t('Brush Shortcut'), hint: t("Picks up the image editor's brush, or puts it down. Heard only there, never while typing.") };
    case 'crop':
      return { label: t('Crop Shortcut'), hint: t("Picks up the image editor's crop, or puts it down. Heard only there, never while typing.") };
    case 'blur':
      return { label: t('Blur Shortcut'), hint: t("Picks up the image editor's blur, or puts it down. Heard only there, never while typing.") };
    case 'layers':
      return { label: t('Layers Shortcut'), hint: t("Shows or hides the image editor's layers. Heard only there, never while typing.") };
    case 'brushSmaller':
      return { label: t('Narrower Brush Shortcut'), hint: t("Makes the image editor's brush narrower. Heard only there, never while typing.") };
    case 'brushLarger':
      return { label: t('Wider Brush Shortcut'), hint: t("Makes the image editor's brush wider. Heard only there, never while typing.") };
    case 'blurRectangle':
      return { label: t('Blur Rectangle Shortcut'), hint: t('Blurs inside a rectangle in the image editor. Heard only there, never while typing.') };
    case 'blurLasso':
      return { label: t('Blur Lasso Shortcut'), hint: t('Blurs inside a lasso in the image editor. Heard only there, never while typing.') };
    case 'blurGradual':
      return { label: t('Gradual Blur Shortcut'), hint: t('Blurs gradually along a line in the image editor. Heard only there, never while typing.') };
  }
}

/** How each is read and how each is stored, for Save. */
const SHORTCUTS: { key: ShortcutKey; stored: () => string; store: (next: string) => void }[] = [
  { key: 'palette', stored: paletteShortcut, store: setPaletteShortcut },
  { key: 'recent', stored: recentShortcut, store: setRecentShortcut },
  { key: 'save', stored: saveShortcut, store: setSaveShortcut },
  { key: 'format', stored: formatShortcut, store: setFormatShortcut },
  { key: 'turn', stored: turnShortcut, store: setTurnShortcut },
  { key: 'add', stored: addShortcut, store: setAddShortcut },
  { key: 'select', stored: selectShortcut, store: setSelectShortcut },
  { key: 'joint', stored: jointShortcut, store: setJointShortcut },
  { key: 'undo', stored: undoShortcut, store: setUndoShortcut },
  { key: 'redo', stored: redoShortcut, store: setRedoShortcut },
  { key: 'duplicate', stored: duplicateShortcut, store: setDuplicateShortcut },
  { key: 'publish', stored: publishShortcut, store: setPublishShortcut },
  { key: 'copy', stored: copyShortcut, store: setCopyShortcut },
  { key: 'cut', stored: cutShortcut, store: setCutShortcut },
  { key: 'paste', stored: pasteShortcut, store: setPasteShortcut },
  { key: 'voiceMute', stored: voiceMuteShortcut, store: setVoiceMuteShortcut },
  { key: 'zoomIn', stored: zoomInShortcut, store: setZoomInShortcut },
  { key: 'zoomOut', stored: zoomOutShortcut, store: setZoomOutShortcut },
  { key: 'arrange', stored: arrangeShortcut, store: setArrangeShortcut },
  { key: 'magicRectangle', stored: magicRectangleShortcut, store: setMagicRectangleShortcut },
  { key: 'magicLasso', stored: magicLassoShortcut, store: setMagicLassoShortcut },
  { key: 'magicAll', stored: magicAllShortcut, store: setMagicAllShortcut },
  { key: 'nextTab', stored: nextTabShortcut, store: setNextTabShortcut },
  { key: 'previousTab', stored: previousTabShortcut, store: setPreviousTabShortcut },
  { key: 'nextWindow', stored: nextWindowShortcut, store: setNextWindowShortcut },
  { key: 'previousWindow', stored: previousWindowShortcut, store: setPreviousWindowShortcut },
  { key: 'find', stored: findShortcut, store: setFindShortcut },
  ...IMAGE_EDITOR_SHORTCUTS.map((name) => ({
    key: name,
    stored: () => imageEditorShortcut(name),
    store: (next: string) => setImageEditorShortcut(name, next),
  })),
];

export interface PreferencesPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/**
 * What one person has decided about their own interface.
 *
 * Appearance, and what the server keeps about a person for them: the address to
 * write to, whether the tracker writes to it, and whether their chats say what
 * an answer cost. The theme and the shortcuts are properties of the machine
 * somebody is sitting at and stay in the browser; the rest follows them between
 * machines, so it lives on the server. Which side a new setting goes on is that
 * question and not how small it is. Security keys belong here too, when they
 * arrive.
 */
function PreferencesView({ session, onSignOut, onDiscard }: PreferencesPageProps & { onDiscard: () => void }) {
  /*
   * Every change on this page is a draft until Save. It used to take effect
   * the moment it was made - a shortcut recorded, a theme pressed, a language
   * chosen - with nothing to press and nothing to say whether it had taken; a
   * Save at the foot and a count of what is waiting is how every other
   * settings page reads.
   */
  const [shortcutDrafts, setShortcutDrafts] = useState<Partial<Record<ShortcutKey, string>>>({});
  const draftShortcut = (key: ShortcutKey, next: string) =>
    setShortcutDrafts((held) => ({ ...held, [key]: next }));
  const storedPalette = usePaletteShortcut();
  const shortcut = shortcutDrafts.palette ?? storedPalette;
  const storedRecent = useRecentShortcut();
  const recent = shortcutDrafts.recent ?? storedRecent;
  const storedSave = useSaveShortcut();
  const save = shortcutDrafts.save ?? storedSave;
  const storedFormat = useFormatShortcut();
  const format = shortcutDrafts.format ?? storedFormat;
  const storedTurn = useTurnShortcut();
  const turn = shortcutDrafts.turn ?? storedTurn;
  const storedAdd = useAddShortcut();
  const add = shortcutDrafts.add ?? storedAdd;
  const storedSelect = useSelectShortcut();
  const select = shortcutDrafts.select ?? storedSelect;
  const storedJoint = useJointShortcut();
  const joint = shortcutDrafts.joint ?? storedJoint;
  const storedUndo = useUndoShortcut();
  const undo = shortcutDrafts.undo ?? storedUndo;
  const storedMagicRectangle = useMagicRectangleShortcut();
  const magicRectangleKey = shortcutDrafts.magicRectangle ?? storedMagicRectangle;
  const storedMagicAll = useMagicAllShortcut();
  const magicAllKey = shortcutDrafts.magicAll ?? storedMagicAll;
  const storedNextTab = useNextTabShortcut();
  const nextTabKey = shortcutDrafts.nextTab ?? storedNextTab;
  const storedPreviousTab = usePreviousTabShortcut();
  const previousTabKey = shortcutDrafts.previousTab ?? storedPreviousTab;
  const storedNextWindow = useNextWindowShortcut();
  const nextWindowKey = shortcutDrafts.nextWindow ?? storedNextWindow;
  const storedPreviousWindow = usePreviousWindowShortcut();
  const previousWindowKey = shortcutDrafts.previousWindow ?? storedPreviousWindow;
  const storedImageEditor = useImageEditorShortcuts();
  const storedFind = useFindShortcut();
  const findKey = shortcutDrafts.find ?? storedFind;
  const storedMagicLasso = useMagicLassoShortcut();
  const magicLassoKey = shortcutDrafts.magicLasso ?? storedMagicLasso;
  const storedZoomIn = useZoomInShortcut();
  const zoomIn = shortcutDrafts.zoomIn ?? storedZoomIn;
  const storedZoomOut = useZoomOutShortcut();
  const zoomOut = shortcutDrafts.zoomOut ?? storedZoomOut;
  const storedArrange = useArrangeShortcut();
  const arrange = shortcutDrafts.arrange ?? storedArrange;
  const storedRedo = useRedoShortcut();
  const redo = shortcutDrafts.redo ?? storedRedo;
  const storedDuplicate = useDuplicateShortcut();
  const duplicate = shortcutDrafts.duplicate ?? storedDuplicate;
  const storedPublish = usePublishShortcut();
  const storedCopy = useCopyShortcut();
  const copyKey = shortcutDrafts.copy ?? storedCopy;
  const storedCut = useCutShortcut();
  const cutKey = shortcutDrafts.cut ?? storedCut;
  const storedPaste = usePasteShortcut();
  const pasteKey = shortcutDrafts.paste ?? storedPaste;
  const publish = shortcutDrafts.publish ?? storedPublish;
  const storedVoiceMute = useVoiceMuteShortcut();
  const voiceMute = shortcutDrafts.voiceMute ?? storedVoiceMute;
  /**
   * Which shortcut the next keystroke belongs to, or null while none is being
   * recorded. Not a boolean: there are ten of these now, and they share the one
   * listener — one per shortcut would fight over the same keypress.
   */
  const [recording, setRecording] = useState<
    | 'palette'
    | 'recent'
    | 'save'
    | 'format'
    | 'turn'
    | 'add'
    | 'joint'
    | 'select'
    | 'undo'
    | 'redo'
    | 'duplicate'
    | 'publish'
    | 'copy'
    | 'cut'
    | 'paste'
    | 'voiceMute'
    | 'zoomIn'
    | 'zoomOut'
    | 'arrange'
    | 'magicRectangle'
    | 'magicLasso'
    | 'magicAll'
    | 'nextTab'
    | 'previousTab'
    | 'nextWindow'
    | 'previousWindow'
    | 'find'
    | ImageEditorShortcut
    | null
  >(null);
  const [refused, setRefused] = useState<string | null>(null);

  /*
   * Recording listens for one keystroke and takes it, whatever it is.
   *
   * Captured rather than picked from a list, because which keys are free is a
   * property of somebody's machine — their browser, their window manager, their
   * habits — and a list of three guesses cannot know any of that.
   */
  useEffect(() => {
    if (recording === null) return;

    function onKey(event: KeyboardEvent) {
      const said = describe(event);
      if (said === null) return;

      event.preventDefault();
      event.stopPropagation();
      if (said === 'Escape') {
        setRecording(null);
        setRefused(null);
        return;
      }
      /*
       * A bare letter is refused everywhere except the three canvas ones.
       *
       * The others fire wherever somebody is typing, so a letter alone would
       * trigger them mid-word. Turning a node, opening the Add menu and the
       * selection rectangle are only honoured on the canvas, where a letter is
       * free - which is why R, A and S can be the defaults there and cannot be
       * anywhere else.
       */
      if (recording !== 'turn' && recording !== 'add' && recording !== 'select' && recording !== 'joint' && recording !== 'magicRectangle' && recording !== 'magicLasso' && !inImageEditor(recording) && !usable(said)) {
        setRefused(said);
        return;
      }

      if (recording === 'palette') draftShortcut('palette', said);
      else if (recording === 'recent') draftShortcut('recent', said);
      else if (recording === 'save') draftShortcut('save', said);
      else if (recording === 'turn') draftShortcut('turn', said);
      else if (recording === 'add') draftShortcut('add', said);
      else if (recording === 'select') draftShortcut('select', said);
      else if (recording === 'joint') draftShortcut('joint', said);
      else if (recording === 'undo') draftShortcut('undo', said);
      else if (recording === 'redo') draftShortcut('redo', said);
      else if (recording === 'duplicate') draftShortcut('duplicate', said);
      else if (recording === 'publish') draftShortcut('publish', said);
      else if (recording === 'copy') draftShortcut('copy', said);
      else if (recording === 'cut') draftShortcut('cut', said);
      else if (recording === 'paste') draftShortcut('paste', said);
      else if (recording === 'voiceMute') draftShortcut('voiceMute', said);
      else if (recording === 'zoomIn') draftShortcut('zoomIn', said);
      else if (recording === 'zoomOut') draftShortcut('zoomOut', said);
      else if (recording === 'arrange') draftShortcut('arrange', said);
      else if (recording === 'magicRectangle') draftShortcut('magicRectangle', said);
      else if (recording === 'magicLasso') draftShortcut('magicLasso', said);
      else if (recording === 'magicAll') draftShortcut('magicAll', said);
      else if (recording === 'nextTab') draftShortcut('nextTab', said);
      else if (recording === 'previousTab') draftShortcut('previousTab', said);
      else if (recording === 'nextWindow') draftShortcut('nextWindow', said);
      else if (recording === 'previousWindow') draftShortcut('previousWindow', said);
      else if (inImageEditor(recording)) draftShortcut(recording, said);
      else draftShortcut('format', said);
      setRecording(null);
      setRefused(null);
    }

    window.addEventListener('keydown', onKey, true);
    // The desktop app holds the tab keys before a page sees them; while recording, it lets them through.
    recordingKeys(true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      recordingKeys(false);
    };
  }, [recording]);

  const [theme, setTheme] = useState<Theme>(currentTheme);

  /*
   * The language, sent before it is applied.
   *
   * The other way round for the theme beside it, which is applied first because
   * a repaint is instant and costs nothing if the server never hears. This one
   * reloads the page - `session/language.ts` says why - so applying it first
   * would tear the tab down with the mutation still in the air, and the choice
   * would hold until the next reload and then quietly be gone. Sending first
   * also means a refusal leaves everything as it was, with the reason on screen.
   */
  const language = currentLanguage();
  const [languageError, setLanguageError] = useState<string | null>(null);

  /**
   * The time zone, sent and then applied. No reload: this page draws no times,
   * and every page after it formats its times as it renders.
   */
  const [zone, setZone] = useState<string>(chosenTimeZone() ?? '');
  const [savedZone, setSavedZone] = useState<string>(chosenTimeZone() ?? '');
  const [zoneError, setZoneError] = useState<string | null>(null);

  /** The language chosen and not yet saved; applying it reloads the page, so it is saved last. */
  const [pickedLanguage, setPickedLanguage] = useState<Language>(language);

  /*
   * The address, as it is now and as it is being typed.
   *
   * Seeded from the session because that is where the answer already arrives -
   * the recorded one where there is one, and the provider's until somebody
   * changes it. Kept here after saving rather than re-read: the session was
   * fetched once, when the application started, and it would go on saying the
   * old address until the next reload.
   */
  const [email, setEmail] = useState(session.email ?? '');
  /** What the server last said, so the button knows whether anything has changed. */
  const [savedEmail, setSavedEmail] = useState(session.email ?? '');
  const [emailSaid, setEmailSaid] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function saveEmail(): Promise<boolean> {
    setEmailError(null);
    setEmailSaid(null);
    try {
      const held = await setUserEmail(email.trim());
      setEmail(held.email ?? '');
      setSavedEmail(held.email ?? '');
      setEmailSaid(
        held.email === null
          ? t('Cleared. Your directory entry fills it in again at your next sign-in.')
          : t('Saved. Signing in no longer overwrites it.'),
      );
      return true;
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : t('Could not save the address.'));
      return false;
    }
  }

  /*
   * Whether the tracker writes to that address as well as ringing the bell.
   *
   * Seeded from the session for the reason the address above is: it arrives with
   * the page, and asking a second question for one boolean would be a round trip
   * to show a control somebody may never touch. Saved on the click rather than
   * behind a button - there is nothing to type and nothing to get wrong, so a
   * Save beside it would only be a second thing to remember to press.
   */
  const [notify, setNotify] = useState(session.emailNotifications !== false);
  const [savedNotify, setSavedNotify] = useState(session.emailNotifications !== false);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  /**
   * Whether a chat prints what an answer cost beside how long it took.
   *
   * Seeded from the session and saved on the click, exactly as the switch above
   * it is, and for the same two reasons. Here rather than on the workspace
   * because a chat is one person's - nobody else can open the screen this
   * decides about - and on the server rather than in this browser's storage
   * because it is not a fact about this machine: somebody watching what they
   * spend wants it watched wherever they sign in.
   */
  const [costShown, setCostShown] = useState(session.chatCostShown !== false);
  const [savedCost, setSavedCost] = useState(session.chatCostShown !== false);
  const [costError, setCostError] = useState<string | null>(null);
  /* Their avatar beside what they said in a chat; theirs, on the server, for the cost line's reasons. */
  const [avatarShown, setAvatarShown] = useState(session.chatAvatarShown !== false);
  const [savedAvatar, setSavedAvatar] = useState(session.chatAvatarShown !== false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [savedTheme, setSavedTheme] = useState<Theme>(currentTheme);
  const [accent, setAccent] = useState<Accent>(currentAccent);
  const [savedAccent, setSavedAccent] = useState<Accent>(currentAccent);
  const [dragEffect, setDragEffect] = useState<DragEffect>(currentDragEffect);
  const [savedDragEffect, setSavedDragEffect] = useState<DragEffect>(currentDragEffect);

  /** Every setting that differs from what is stored, by name - what the count at the foot counts. */
  const shortcutsUnsaved = SHORTCUTS.filter(
    ({ key, stored }) => shortcutDrafts[key] !== undefined && shortcutDrafts[key] !== stored(),
  );
  const unsaved = [
    email.trim() !== savedEmail,
    notify !== savedNotify,
    costShown !== savedCost,
    avatarShown !== savedAvatar,
    zone !== savedZone,
    theme !== savedTheme,
    accent !== savedAccent,
    dragEffect !== savedDragEffect,
    pickedLanguage !== language,
  ].filter(Boolean).length + shortcutsUnsaved.length;
  const [saving, setSaving] = useState(false);

  /**
   * Everything waiting, stored. Each setting is its own write with its own
   * refusal, said beside it; what stored stays stored. The language goes last,
   * because applying it reloads the page.
   */
  async function saveAll() {
    if (saving) return;
    setSaving(true);
    let failed = false;
    if (email.trim() !== savedEmail && !(await saveEmail())) failed = true;
    if (notify !== savedNotify) {
      setNotifyError(null);
      try {
        const held = await setUserEmailNotifications(notify);
        setNotify(held.emailNotifications);
        setSavedNotify(held.emailNotifications);
      } catch (cause) {
        setNotifyError(cause instanceof Error ? cause.message : t('Could not save that.'));
        failed = true;
      }
    }
    if (costShown !== savedCost) {
      setCostError(null);
      try {
        const held = await setChatCostShown(costShown);
        setCostShown(held.chatCostShown);
        setSavedCost(held.chatCostShown);
      } catch (cause) {
        setCostError(cause instanceof Error ? cause.message : t('Could not save that.'));
        failed = true;
      }
    }
    if (avatarShown !== savedAvatar) {
      setAvatarError(null);
      try {
        const held = await setChatAvatarShown(avatarShown);
        setAvatarShown(held.chatAvatarShown);
        setSavedAvatar(held.chatAvatarShown);
      } catch (cause) {
        setAvatarError(cause instanceof Error ? cause.message : t('Could not save that.'));
        failed = true;
      }
    }
    if (zone !== savedZone) {
      setZoneError(null);
      try {
        await setMyTimeZone(zone === '' ? null : zone);
        adoptTimeZone(zone === '' ? null : zone);
        setSavedZone(zone);
      } catch (cause) {
        setZoneError(cause instanceof Error ? cause.message : t('Could not save that.'));
        failed = true;
      }
    }
    if (theme !== savedTheme) {
      applyTheme(theme);
      rememberTheme(theme);
      setSavedTheme(theme);
    }
    if (accent !== savedAccent) {
      applyAccent(accent);
      rememberAccent(accent);
      setSavedAccent(accent);
    }
    if (dragEffect !== savedDragEffect) {
      rememberDragEffect(dragEffect);
      setSavedDragEffect(dragEffect);
    }
    for (const { key, store } of shortcutsUnsaved) store(shortcutDrafts[key] as string);
    setShortcutDrafts({});
    if (pickedLanguage !== language && !failed) {
      setLanguageError(null);
      try {
        await setMyLanguage(pickedLanguage);
        // Applies it, remembers it, and reloads into it. Nothing after this runs.
        setLanguage(pickedLanguage);
        return;
      } catch (cause) {
        setLanguageError(cause instanceof Error ? cause.message : t('Could not save that.'));
      }
    }
    setSaving(false);
  }

  return (
    <AppShell
      scrollContent
      user={shellUser(session)}
      showAdmin={session.admin}
      onSignOut={onSignOut}
      hideSidebar
      sidebar={null}
    >
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.headerRow}>
            <header className={styles.header}>
              <h1 className={styles.title}>{t('User Preferences')}</h1>
              <p className={styles.subtitle}>
                {t('Manage your developer profile, app appearance, models, and security keys.')}
              </p>
            </header>
          </div>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t('Profile')}</h2>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <label className={styles.settingLabel} htmlFor="profile-email">
                  {t('Email Address')}
                </label>
                <FieldHint label={t('Email Address')}>
                  {t('Taken from your directory entry to begin with, and refreshed from it each time you sign in until you set one here. Emptying it hands it back.')}
                </FieldHint>
              </span>
              <div className={styles.row}>
                <input
                  id="profile-email"
                  className={styles.input}
                  type="email"
                  value={email}
                  placeholder="nobody@example.com"
                  autoComplete="email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailSaid(null);
                    setEmailError(null);
                  }}
                />
              </div>
              {emailSaid !== null && <p className={styles.done}>{emailSaid}</p>}
              {emailError !== null && (
                <p className={styles.error} role="alert">
                  {emailError}
                </p>
              )}
            </div>
          </section>

          {/*
            Their own access tokens, made here rather than by asking an
            administrator. Only an internal user may hold one - a directory
            user's would outlive whatever the directory decides about them - so
            for anybody else the section is not drawn at all. Issue #2.
          */}
          {session.tokensAllowed === true && (
            <section className={styles.card} data-testid="preferences-tokens">
              <h2 className={styles.sectionTitle}>{t('Access Tokens')}</h2>
              <div className={styles.setting}>
                <span className={styles.labelWithHint}>
                  <span className={styles.settingLabel}>{t('Your tokens')}</span>
                  <FieldHint label={t('Access Tokens')}>
                    {t('A token is you by another door: it carries your roles and nothing more. Sent as an Authorization: Bearer header.')}
                  </FieldHint>
                </span>
                <AccessTokens inputClassName={styles.input} buttonClassName={styles.save} />
              </div>
            </section>
          )}

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t('Notifications')}</h2>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="issue-email">{t('Issue Email')}</span>
                <FieldHint label={t('Issue Email')}>
                  {t('Sends you what the bell already shows - an issue you filed, hold or observe being opened, assigned, commented on or closed, and any comment with your name in it. It changes nothing about what you hear, only where. Mail goes to the address above, so without one there is nothing to send; an installation whose administrator has not configured a mail server sends nothing either way.')}
                </FieldHint>
              </span>
              <div className={styles.options} role="radiogroup" aria-labelledby="issue-email">
                <button
                  type="button"
                  role="radio"
                  aria-checked={notify}
                  disabled={saving}
                  className={notify ? styles.optionCurrent : styles.option}
                  onClick={() => setNotify(true)}
                >{t('On')}</button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!notify}
                  disabled={saving}
                  className={notify ? styles.option : styles.optionCurrent}
                  onClick={() => setNotify(false)}
                >{t('Off')}</button>
              </div>
              {notifyError !== null && (
                <p className={styles.error} role="alert">
                  {notifyError}
                </p>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t('Chat')}</h2>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="answer-cost">{t('Answer Cost')}</span>
                <FieldHint label={t('Answer Cost')}>
                  <p>
                    {t('Puts what an answer cost beside how long it took, on the answer just given.')}
                  </p>
                  <ul>
                    <li>
                      It is the <strong>{t('whole turn')}</strong>, not the last call in it: an agent that
                      looks something up before it answers has paid for two rounds, and both are
                      counted.
                    </li>
                    <li>
                      {t('Money needs prices, which are recorded on the model. A model carrying none shows the tokens and nothing else, because no price is not a price of nothing.')}
                    </li>
                    <li>
                      {t('Nothing is shown where the provider reported no counts, or for any answer read back out of the history - what was said is kept, what it cost is not.')}
                    </li>
                  </ul>
                </FieldHint>
              </span>
              <div className={styles.options} role="radiogroup" aria-labelledby="answer-cost">
                <button
                  type="button"
                  role="radio"
                  aria-checked={costShown}
                  disabled={saving}
                  className={costShown ? styles.optionCurrent : styles.option}
                  onClick={() => setCostShown(true)}
                >{t('On')}</button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!costShown}
                  disabled={saving}
                  className={costShown ? styles.option : styles.optionCurrent}
                  onClick={() => setCostShown(false)}
                >{t('Off')}</button>
              </div>
              {costError !== null && (
                <p className={styles.error} role="alert">
                  {costError}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="chat-avatar">{t('Avatar in Chat')}</span>
                <FieldHint label={t('Avatar in Chat')}>
                  <p>{t("Draws your avatar beside what you said, as the agent's is drawn beside its answers.")}</p>
                </FieldHint>
              </span>
              <div className={styles.options} role="radiogroup" aria-labelledby="chat-avatar">
                <button
                  type="button"
                  role="radio"
                  aria-checked={avatarShown}
                  disabled={saving}
                  className={avatarShown ? styles.optionCurrent : styles.option}
                  onClick={() => setAvatarShown(true)}
                >{t('On')}</button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!avatarShown}
                  disabled={saving}
                  className={avatarShown ? styles.option : styles.optionCurrent}
                  onClick={() => setAvatarShown(false)}
                >{t('Off')}</button>
              </div>
              {avatarError !== null && (
                <p className={styles.error} role="alert">
                  {avatarError}
                </p>
              )}
            </div>
          </section>

          {/*
            Every setting on this page said what it was for in a paragraph under
            its control, which is the convention the rest of the product moved
            away from - so each of those paragraphs is now behind the (?) beside
            its label.

            What stayed is what is only true while somebody is pressing keys: the
            combination the recorder just turned down, and the line telling them
            what to do next. Neither explains the setting; both are the state of
            the control at that moment, and a note nobody can see while it is
            happening would be no use at all.
          */}
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>{t('Appearance')}</h2>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="interface-language">{t('Language')}</span>
                <FieldHint label={t('Language')}>
                  {t('Kept with your account, so it follows you to another machine.')}
                </FieldHint>
              </span>
              {/*
                Each language names itself in itself - Polski, not Polish.
                Somebody looking for their own language is looking for the word
                they call it by, and a list written in a language they cannot
                read is a list they cannot use.
              */}
              <div className={styles.options} role="radiogroup" aria-labelledby="interface-language">
                {LANGUAGES.map((one) => (
                  <button
                    key={one}
                    type="button"
                    role="radio"
                    lang={one}
                    disabled={saving}
                    aria-checked={pickedLanguage === one}
                    className={pickedLanguage === one ? styles.optionCurrent : styles.option}
                    onClick={() => setPickedLanguage(one)}
                  >
                    {LANGUAGE_NAMES[one]}
                  </button>
                ))}
              </div>
              {languageError !== null && (
                <p className={styles.error} role="alert">
                  {languageError}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <label className={styles.settingLabel} htmlFor="preferences-time-zone">{t('Time Zone')}</label>
                <FieldHint label={t('Time Zone')}>
                  {t('Every date and time is shown in it. Kept with your account, so it follows you to another machine.')}
                </FieldHint>
              </span>
              <Select
                id="preferences-time-zone"
                className={styles.input}
                value={zone}
                disabled={saving}
                onChange={(picked) => setZone(picked)}
              >
                <option value="">{tf('This browser\'s ({zone})',{ zone: browserTimeZone() })}</option>
                {timeZones().map((one) => (
                  <option key={one} value={one}>
                    {one}
                  </option>
                ))}
              </Select>
              {zoneError !== null && (
                <p className={styles.error} role="alert">
                  {zoneError}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="interface-theme">
                  {t('Interface Theme')}
                </span>
                <FieldHint label={t('Interface Theme')}>
                  {t('Kept in this browser, so it applies before the first paint rather than after a round trip.')}
                </FieldHint>
              </span>
              <div className={styles.options} role="radiogroup" aria-labelledby="interface-theme">
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === 'dark'}
                  className={theme === 'dark' ? styles.optionCurrent : styles.option}
                  onClick={() => setTheme('dark')}
                >
                  <img src={moonIcon} alt="" width={14} height={14} />
                  {t('Dark Mode')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === 'light'}
                  className={theme === 'light' ? styles.optionCurrent : styles.option}
                  onClick={() => setTheme('light')}
                >
                  <img src={sunIcon} alt="" width={14} height={14} />
                  {t('Light Mode')}
                </button>
              </div>
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="interface-accent">
                  {t('Accent Colour')}
                </span>
                <FieldHint label={t('Accent Colour')}>
                  {t('The colour of buttons, your messages and what is selected. Kept in this browser.')}
                </FieldHint>
              </span>
              <div className={styles.swatches} role="radiogroup" aria-labelledby="interface-accent" data-testid="accent">
                {ACCENTS.map((one) => (
                  <button
                    key={one}
                    type="button"
                    role="radio"
                    aria-checked={accent === one}
                    aria-label={accentName(one)}
                    title={accentName(one)}
                    className={accent === one ? `${styles.swatch} ${styles.swatchCurrent}` : styles.swatch}
                    data-accent-option={one}
                    onClick={() => setAccent(one)}
                  >
                    <span className={styles.swatchColour} data-swatch={one} />
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="drag-effect">
                  {t('Node Drag Effect')}
                </span>
                <FieldHint label={t('Node Drag Effect')}>
                  {t('How a workflow node moves while you drag it. Kept in this browser.')}
                </FieldHint>
              </span>
              <div className={styles.options} role="radiogroup" aria-labelledby="drag-effect" data-testid="drag-effect">
                {([
                  ['off', t('Off')],
                  ['jelly', t('Jelly')],
                  ['slide', t('Jelly and slide')],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={dragEffect === value}
                    className={dragEffect === value ? styles.optionCurrent : styles.option}
                    onClick={() => setDragEffect(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="palette-shortcut">
                  {t('Quick Actions Shortcut')}
                </span>
                {/*
                  "Go To Shortcut" until issue #218, which is what the box in
                  the top bar was called before it offered anything to do as
                  well as somewhere to go. It is Quick actions now, and this
                  says so: a shortcut named after a label nobody sees is a
                  setting nobody connects to the thing it opens. Title case
                  because every other label on this page is - "Save Shortcut",
                  "Turn Node Shortcut" - not because the box is called that.
                  The keystroke and where it is stored are unchanged.
                */}
                <FieldHint label={t('Quick Actions Shortcut')}>
                  {t('Opens the box in the top bar from anywhere. Yours to choose: which keys are free depends on your browser and your machine, not on this application.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'palette' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'palette' ? null : 'palette'));
                  }}
                >
                  {recording === 'palette' ? 'Press any keys\u2026' : shortcut}
                </button>
                {shortcut !== DEFAULT_SHORTCUT && recording !== 'palette' && (
                  <button
                    type="button"
                    className={styles.option}
                    onClick={() => draftShortcut('palette', DEFAULT_SHORTCUT)}
                  >{t('Reset')}</button>
                )}
              </div>
              {recording === 'palette' && (
                <p className={styles.settingNote}>
                  {refused !== null ? (
                    <>
                    <strong>{refused}</strong> would fire while typing. Hold Ctrl, Alt, Shift or Cmd
                    with it — or use a function key.
                    </>
                  ) : (
                    <>Press the combination you want. Escape leaves it as it is.</>
                  )}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="recent-shortcut">
                  {t('Recently Opened Shortcut')}
                </span>
                <FieldHint label={t('Recently Opened Shortcut')}>
                  {t('Opens the same box in the top bar, but onto what you last had open rather than onto everything. The list is kept in this browser and goes no further; it holds addresses only, so anything renamed since is listed under the name it has now and anything deleted is not listed at all.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'recent' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'recent' ? null : 'recent'));
                  }}
                >
                  {recording === 'recent' ? t('Press any keys…') : recent}
                </button>
                {recent !== DEFAULT_RECENT_SHORTCUT && recording !== 'recent' && (
                  <button
                    type="button"
                    className={styles.option}
                    onClick={() => draftShortcut('recent', DEFAULT_RECENT_SHORTCUT)}
                  >{t('Reset')}</button>
                )}
              </div>
              {recording === 'recent' && (
                <p className={styles.settingNote}>
                  {refused !== null ? (
                    <>
                    <strong>{refused}</strong> would fire while typing. Hold Ctrl, Alt, Shift or Cmd
                    with it — or use a function key.
                    </>
                  ) : (
                    <>Press the combination you want. Escape leaves it as it is.</>
                  )}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="save-shortcut">{t('Save Shortcut')}</span>
                <FieldHint label={t('Save Shortcut')}>
                  {t('Saves whatever editor you are in, and stops the browser offering to save the page instead. The function editor shows this key beside its details.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'save' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'save' ? null : 'save'));
                  }}
                >
                  {recording === 'save' ? 'Press any keys\u2026' : save}
                </button>
                {save !== DEFAULT_SAVE_SHORTCUT && recording !== 'save' && (
                  <button
                    type="button"
                    className={styles.option}
                    onClick={() => draftShortcut('save', DEFAULT_SAVE_SHORTCUT)}
                  >{t('Reset')}</button>
                )}
              </div>
              {recording === 'save' && (
                <p className={styles.settingNote}>
                  {refused !== null ? (
                    <>
                    <strong>{refused}</strong> would fire while typing. Hold Ctrl, Alt, Shift or Cmd
                    with it — or use a function key.
                    </>
                  ) : (
                    <>Press the combination you want. Escape leaves it as it is.</>
                  )}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="format-shortcut">
                  {t('Format Shortcut')}
                </span>
                <FieldHint label={t('Format Shortcut')}>
                  {t('Lays out the code in the function editor, with the same language service that completes and checks it. Prevented from reaching the browser, which has its own ideas about this one.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'format' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'format' ? null : 'format'));
                  }}
                >
                  {recording === 'format' ? t('Press any keys…') : format}
                </button>
                {format !== DEFAULT_FORMAT_SHORTCUT && recording !== 'format' && (
                  <button
                    type="button"
                    className={styles.option}
                    onClick={() => draftShortcut('format', DEFAULT_FORMAT_SHORTCUT)}
                  >{t('Reset')}</button>
                )}
              </div>
              {recording === 'format' && (
                <p className={styles.settingNote}>
                  {refused !== null ? (
                    <>
                    <strong>{refused}</strong> would fire while typing. Hold Ctrl, Alt, Shift or Cmd
                    with it — or use a function key.
                    </>
                  ) : (
                    <>Press the combination you want. Escape leaves it as it is.</>
                  )}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="turn-shortcut">
                  {t('Turn Node Shortcut')}
                </span>
                <FieldHint label={t('Turn Node Shortcut')}>
                  {t('Turns the selected node on the workflow canvas, so a graph can run down the screen instead of off the side of it. A bare letter is allowed here, unlike the others: this one is only heard on the canvas, never while typing.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'turn' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'turn' ? null : 'turn'));
                  }}
                >
                  {recording === 'turn' ? t('Press any keys…') : turn}
                </button>
                {turn !== DEFAULT_TURN_SHORTCUT && recording !== 'turn' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('turn', DEFAULT_TURN_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'turn' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="add-shortcut">
                  {t('Add Node Shortcut')}
                </span>
                <FieldHint label={t('Add Node Shortcut')}>
                  {t('Opens the workflow editor\'s Add menu and puts the first kind of node under the keyboard, so a graph can be built without reaching for the toolbar. A bare letter is allowed here for the same reason it is above: only the canvas hears it.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'add' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'add' ? null : 'add'));
                  }}
                >
                  {recording === 'add' ? t('Press any keys…') : add}
                </button>
                {add !== DEFAULT_ADD_SHORTCUT && recording !== 'add' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('add', DEFAULT_ADD_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'add' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="select-shortcut">
                  {t('Rectangle Select Shortcut')}
                </span>
                <FieldHint label={t('Rectangle Select Shortcut')}>
                  {t('Switches the workflow canvas between panning and drawing a selection rectangle, the same as the button in its corner. Shift-drag draws one at any time. A bare letter is allowed here because only the canvas hears it.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'select' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'select' ? null : 'select'));
                  }}
                >
                  {recording === 'select' ? t('Press any keys…') : select}
                </button>
                {select !== DEFAULT_SELECT_SHORTCUT && recording !== 'select' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('select', DEFAULT_SELECT_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'select' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="joint-shortcut">
                  {t('Joint Tool Shortcut')}
                </span>
                <FieldHint label={t('Joint Tool Shortcut')}>
                  {t('Switches the workflow canvas’s Joint tool on and off, the same as its button. While it is on, a click on a line puts a joint there. A bare letter is allowed here because only the canvas hears it.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'joint' ? styles.optionCurrent : styles.option}
                  data-shortcut="joint"
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'joint' ? null : 'joint'));
                  }}
                >
                  {recording === 'joint' ? t('Press any keys…') : joint}
                </button>
                {joint !== DEFAULT_JOINT_SHORTCUT && recording !== 'joint' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('joint', DEFAULT_JOINT_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'joint' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="undo-shortcut">{t('Undo Shortcut')}</span>
                <FieldHint label={t('Undo Shortcut')}>
                  {t('Steps back through what you have drawn on the workflow canvas. Ignored while a caret is in a text box, where the browser\'s own undo is the right one.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'undo' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'undo' ? null : 'undo'));
                  }}
                >
                  {recording === 'undo' ? t('Press any keys…') : undo}
                </button>
                {undo !== DEFAULT_UNDO_SHORTCUT && recording !== 'undo' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('undo', DEFAULT_UNDO_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'undo' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="redo-shortcut">{t('Redo Shortcut')}</span>
                <FieldHint label={t('Redo Shortcut')}>
                  {t('Steps forward again. Ctrl+Y is heard as well, whatever is chosen here, because it is the other habit people arrive with.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'redo' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'redo' ? null : 'redo'));
                  }}
                >
                  {recording === 'redo' ? t('Press any keys…') : redo}
                </button>
                {redo !== DEFAULT_REDO_SHORTCUT && recording !== 'redo' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('redo', DEFAULT_REDO_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'redo' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="zoomIn-shortcut">{t('Zoom In Shortcut')}</span>
                <FieldHint label={t('Zoom In Shortcut')}>
                  {t('Zooms the image editor in. The number pad + is heard as well.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'zoomIn' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'zoomIn' ? null : 'zoomIn'));
                  }}
                  data-testid="zoomIn-shortcut"
                >
                  {recording === 'zoomIn' ? t('Press any keys…') : zoomIn}
                </button>
                {zoomIn !== DEFAULT_ZOOM_IN_SHORTCUT && recording !== 'zoomIn' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('zoomIn', DEFAULT_ZOOM_IN_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'zoomIn' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="zoomOut-shortcut">{t('Zoom Out Shortcut')}</span>
                <FieldHint label={t('Zoom Out Shortcut')}>
                  {t('Zooms the image editor out. The number pad - is heard as well.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'zoomOut' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'zoomOut' ? null : 'zoomOut'));
                  }}
                  data-testid="zoomOut-shortcut"
                >
                  {recording === 'zoomOut' ? t('Press any keys…') : zoomOut}
                </button>
                {zoomOut !== DEFAULT_ZOOM_OUT_SHORTCUT && recording !== 'zoomOut' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('zoomOut', DEFAULT_ZOOM_OUT_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'zoomOut' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="arrange-shortcut">{t('Arrange Shortcut')}</span>
                <FieldHint label={t('Arrange Shortcut')}>
                  {t('Lays a diagram out again, in the diagram editor.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'arrange' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'arrange' ? null : 'arrange'));
                  }}
                  data-testid="arrange-shortcut"
                >
                  {recording === 'arrange' ? t('Press any keys…') : arrange}
                </button>
                {arrange !== DEFAULT_ARRANGE_SHORTCUT && recording !== 'arrange' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('arrange', DEFAULT_ARRANGE_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'arrange' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="magicRectangle-shortcut">{t('Magic Rectangle Select Shortcut')}</span>
                <FieldHint label={t('Magic Rectangle Select Shortcut')}>
                  {t("Picks the image editor's rectangle select, or puts it down. A single key is fine: it is heard only in the image editor, never while typing.")}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'magicRectangle' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'magicRectangle' ? null : 'magicRectangle'));
                  }}
                  data-testid="magicRectangle-shortcut"
                >
                  {recording === 'magicRectangle' ? t('Press any keys…') : magicRectangleKey}
                </button>
                {magicRectangleKey !== DEFAULT_MAGIC_RECTANGLE_SHORTCUT && recording !== 'magicRectangle' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('magicRectangle', DEFAULT_MAGIC_RECTANGLE_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'magicRectangle' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="magicLasso-shortcut">{t('Magic Lasso Select Shortcut')}</span>
                <FieldHint label={t('Magic Lasso Select Shortcut')}>
                  {t("Picks the image editor's lasso select, or puts it down. A single key is fine: it is heard only in the image editor, never while typing.")}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'magicLasso' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'magicLasso' ? null : 'magicLasso'));
                  }}
                  data-testid="magicLasso-shortcut"
                >
                  {recording === 'magicLasso' ? t('Press any keys…') : magicLassoKey}
                </button>
                {magicLassoKey !== DEFAULT_MAGIC_LASSO_SHORTCUT && recording !== 'magicLasso' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('magicLasso', DEFAULT_MAGIC_LASSO_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'magicLasso' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="magicAll-shortcut">{t('Magic Select All Shortcut')}</span>
                <FieldHint label={t('Magic Select All Shortcut')}>
                  {t("Selects the whole picture in the image editor, to change all of it. Heard only there, never while typing.")}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'magicAll' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'magicAll' ? null : 'magicAll'));
                  }}
                  data-testid="magicAll-shortcut"
                >
                  {recording === 'magicAll' ? t('Press any keys…') : magicAllKey}
                </button>
                {magicAllKey !== DEFAULT_MAGIC_ALL_SHORTCUT && recording !== 'magicAll' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('magicAll', DEFAULT_MAGIC_ALL_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'magicAll' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="find-shortcut">{t('Find Shortcut')}</span>
                <FieldHint label={t('Find Shortcut')}>
                  {t('Opens Find in a document, in its editor and its view, instead of the browser’s own.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'find' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'find' ? null : 'find'));
                  }}
                  data-testid="find-shortcut"
                >
                  {recording === 'find' ? t('Press any keys…') : findKey}
                </button>
                {findKey !== DEFAULT_FIND_SHORTCUT && recording !== 'find' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('find', DEFAULT_FIND_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'find' && <p className={styles.settingNote}>{t('Press the combination you want. Escape leaves it as it is.')}</p>}
            </div>

            {IMAGE_EDITOR_SHORTCUTS.map((which) => {
              const { label, hint } = imageEditorLabel(which);
              const key = shortcutDrafts[which] ?? storedImageEditor[which];
              const fallback = DEFAULT_IMAGE_EDITOR_SHORTCUTS[which];
              return (
                <div className={styles.setting} key={which}>
                  <span className={styles.labelWithHint}>
                    <span className={styles.settingLabel} id={`${which}-shortcut`}>{label}</span>
                    <FieldHint label={label}>{hint}</FieldHint>
                  </span>
                  <div className={styles.options}>
                    <button
                      type="button"
                      className={recording === which ? styles.optionCurrent : styles.option}
                      onClick={() => {
                        setRefused(null);
                        setRecording((held) => (held === which ? null : which));
                      }}
                      data-testid={`imageEditor-${which}-shortcut`}
                    >
                      {recording === which ? t('Press any keys…') : key}
                    </button>
                    {key !== fallback && recording !== which && (
                      <button type="button" className={styles.option} onClick={() => draftShortcut(which, fallback)}>{t('Reset')}</button>
                    )}
                  </div>
                  {recording === which && <p className={styles.settingNote}>{t('Press the combination you want. Escape leaves it as it is.')}</p>}
                </div>
              );
            })}

            {inDesktopApp() && (['nextTab', 'previousTab', 'nextWindow', 'previousWindow'] as const).map((which) => {
              const { label, hint, key, fallback } = {
                nextTab: {
                  label: t('Next Tab Shortcut'),
                  hint: t('Moves to the next tab in the desktop app, from the last back to the first; Ctrl+Tab always does too.'),
                  key: nextTabKey,
                  fallback: DEFAULT_NEXT_TAB_SHORTCUT,
                },
                previousTab: {
                  label: t('Previous Tab Shortcut'),
                  hint: t('Moves to the previous tab in the desktop app, from the first back to the last; Ctrl+Shift+Tab always does too.'),
                  key: previousTabKey,
                  fallback: DEFAULT_PREVIOUS_TAB_SHORTCUT,
                },
                nextWindow: {
                  label: t('Next Window Shortcut'),
                  hint: t('Moves to the next split pane or window in the desktop app, from the last back to the first. With only one open, the keys are left to the page.'),
                  key: nextWindowKey,
                  fallback: DEFAULT_NEXT_WINDOW_SHORTCUT,
                },
                previousWindow: {
                  label: t('Previous Window Shortcut'),
                  hint: t('Moves to the previous split pane or window in the desktop app, from the first back to the last. With only one open, the keys are left to the page.'),
                  key: previousWindowKey,
                  fallback: DEFAULT_PREVIOUS_WINDOW_SHORTCUT,
                },
              }[which];
              return (
                <div className={styles.setting} key={which}>
                  <span className={styles.labelWithHint}>
                    <span className={styles.settingLabel} id={`${which}-shortcut`}>{label}</span>
                    <FieldHint label={label}>
                      {hint}
                    </FieldHint>
                  </span>
                  <div className={styles.options}>
                    <button
                      type="button"
                      className={recording === which ? styles.optionCurrent : styles.option}
                      onClick={() => {
                        setRefused(null);
                        setRecording((held) => (held === which ? null : which));
                      }}
                      data-testid={`${which}-shortcut`}
                    >
                      {recording === which ? t('Press any keys…') : key}
                    </button>
                    {key !== fallback && recording !== which && (
                      <button type="button" className={styles.option} onClick={() => draftShortcut(which, fallback)}>{t('Reset')}</button>
                    )}
                  </div>
                  {recording === which && (
                    <p className={styles.settingNote}>
                      {refused !== null
                        ? tf('{keys} would fire while typing. Hold Ctrl, Alt, Shift or Cmd with it, or use a function key.', { keys: refused })
                        : t('Press the combination you want. Escape leaves it as it is.')}
                    </p>
                  )}
                </div>
              );
            })}

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="duplicate-shortcut">
                  {t('Duplicate Node Shortcut')}
                </span>
                <FieldHint label={t('Duplicate Node Shortcut')}>
                  {t('Puts a second copy of the selected node on the workflow canvas, pointed at the same action, trigger or agent and wired to nothing. The browser\'s own meaning for the usual choice is a bookmark, which the editor takes instead.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'duplicate' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'duplicate' ? null : 'duplicate'));
                  }}
                >
                  {recording === 'duplicate' ? t('Press any keys…') : duplicate}
                </button>
                {duplicate !== DEFAULT_DUPLICATE_SHORTCUT && recording !== 'duplicate' && (
                  <button
                    type="button"
                    className={styles.option}
                    onClick={() => draftShortcut('duplicate', DEFAULT_DUPLICATE_SHORTCUT)}
                  >{t('Reset')}</button>
                )}
              </div>
              {recording === 'duplicate' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="copy-shortcut">
                  {t('Copy Nodes Shortcut')}
                </span>
                <FieldHint label={t('Copy Nodes Shortcut')}>
                  {t("Puts the selected nodes of a workflow, and the lines between them, where Paste can put them back, in this workflow or another. Heard only on the canvas, never while typing.")}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'copy' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'copy' ? null : 'copy'));
                  }}
                  data-testid="copy-shortcut"
                >
                  {recording === 'copy' ? t('Press any keys…') : copyKey}
                </button>
                {copyKey !== DEFAULT_COPY_SHORTCUT && recording !== 'copy' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('copy', DEFAULT_COPY_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'copy' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="cut-shortcut">
                  {t('Cut Nodes Shortcut')}
                </span>
                <FieldHint label={t('Cut Nodes Shortcut')}>
                  {t("Copies the selected nodes of a workflow as Copy does and takes them off the canvas, in one step that Undo puts back. Heard only on the canvas, never while typing.")}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'cut' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'cut' ? null : 'cut'));
                  }}
                  data-testid="cut-shortcut"
                >
                  {recording === 'cut' ? t('Press any keys…') : cutKey}
                </button>
                {cutKey !== DEFAULT_CUT_SHORTCUT && recording !== 'cut' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('cut', DEFAULT_CUT_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'cut' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="paste-shortcut">
                  {t('Paste Nodes Shortcut')}
                </span>
                <FieldHint label={t('Paste Nodes Shortcut')}>
                  {t("Puts the nodes last copied or cut onto the workflow canvas, with the lines between them. Heard only on the canvas, never while typing.")}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'paste' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'paste' ? null : 'paste'));
                  }}
                  data-testid="paste-shortcut"
                >
                  {recording === 'paste' ? t('Press any keys…') : pasteKey}
                </button>
                {pasteKey !== DEFAULT_PASTE_SHORTCUT && recording !== 'paste' && (
                  <button type="button" className={styles.option} onClick={() => draftShortcut('paste', DEFAULT_PASTE_SHORTCUT)}>{t('Reset')}</button>
                )}
              </div>
              {recording === 'paste' && (
                <p className={styles.settingNote}>
                </p>
              )}
            </div>

            <div className={styles.setting}>
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="publish-shortcut">
                  {t('Publish Shortcut')}
                </span>
                <FieldHint label={t('Publish Shortcut')}>
                  {t('Saves the workflow on the canvas and makes that version the one that runs, without reaching for the toolbar. A modifier is required here, unlike the two canvas keys above: publishing changes what everybody else\'s runs do, which is not something a single letter should be able to do by accident.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'publish' ? styles.optionCurrent : styles.option}
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'publish' ? null : 'publish'));
                  }}
                >
                  {recording === 'publish' ? t('Press any keys…') : publish}
                </button>
                {publish !== DEFAULT_PUBLISH_SHORTCUT && recording !== 'publish' && (
                  <button
                    type="button"
                    className={styles.option}
                    onClick={() => draftShortcut('publish', DEFAULT_PUBLISH_SHORTCUT)}
                  >{t('Reset')}</button>
                )}
              </div>
              {recording === 'publish' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>

            <div className={styles.setting} data-voice-mute-setting="">
              <span className={styles.labelWithHint}>
                <span className={styles.settingLabel} id="voice-mute-shortcut">
                  {t('Voice Mute Shortcut')}
                </span>
                <FieldHint label={t('Voice Mute Shortcut')}>
                  {t('Mutes and unmutes your microphone while voice mode is open. Muted, nothing you say is heard or sent, and the answer being read aloud goes on.')}
                </FieldHint>
              </span>
              <div className={styles.options}>
                <button
                  type="button"
                  className={recording === 'voiceMute' ? styles.optionCurrent : styles.option}
                  aria-labelledby="voice-mute-shortcut"
                  data-voice-mute-record=""
                  onClick={() => {
                    setRefused(null);
                    setRecording((held) => (held === 'voiceMute' ? null : 'voiceMute'));
                  }}
                >
                  {recording === 'voiceMute' ? t('Press any keys…') : voiceMute}
                </button>
                {voiceMute !== DEFAULT_VOICE_MUTE_SHORTCUT && recording !== 'voiceMute' && (
                  <button
                    type="button"
                    className={styles.option}
                    onClick={() => draftShortcut('voiceMute', DEFAULT_VOICE_MUTE_SHORTCUT)}
                  >{t('Reset')}</button>
                )}
              </div>
              {recording === 'voiceMute' && (
                <p className={styles.settingNote}>
                  {t('Press the combination you want. Escape leaves it as it is.')}
                </p>
              )}
            </div>
          </section>

          {/* The page's one press, floating at the foot of the window, and how much is waiting for it. */}
          <SaveBar>
            {unsaved > 0 && (
              <span className={styles.pageUnsaved} data-preferences-unsaved="">
                {unsaved === 1 ? t('1 unsaved') : `${unsaved} unsaved`}
              </span>
            )}
            <DiscardButton onDiscard={onDiscard} disabled={saving || unsaved === 0} />
            <button
              type="button"
              className={styles.pageSave}
              disabled={saving || unsaved === 0}
              onClick={() => void saveAll()}
            >
              {saving ? t('Saving…') : t('Save')}
            </button>
          </SaveBar>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * The page, started over by Discard.
 *
 * Discard puts every field back to what the server holds. This page keeps
 * its drafts across many fields and sections, so rather than a second copy
 * of the code that fills them, the page is drawn again from the start and
 * fills them the one way it always does - a round trip, which is the price
 * of there being one way.
 */
export function PreferencesPage(props: PreferencesPageProps) {
  const [discards, setDiscards] = useState(0);
  return <PreferencesView key={discards} {...props} onDiscard={() => setDiscards((held) => held + 1)} />;
}

/** What an accent is called where it is chosen. */
function accentName(accent: Accent): string {
  switch (accent) {
    case 'moss':
      return t('Moss');
    case 'blue':
      return t('Blue');
    case 'teal':
      return t('Teal');
    case 'violet':
      return t('Violet');
    case 'magic':
      return t('Magic');
    case 'rose':
      return t('Rose');
    case 'amber':
      return t('Amber');
    case 'slate':
      return t('Slate');
  }
}
