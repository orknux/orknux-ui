import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cachedWorkspaces } from '../../session/workspaces';
import type { FormEvent, KeyboardEvent } from 'react';

import {
  CALL_ROLE,
  THOUGHT_ROLE,
  chooseChatAgent,
  deleteChat,
  fetchChatMessages,
  fetchChatCompletion,
  fetchChatReplySuggestions,
  postChatMessageDuringTurn,
  fetchChatSession,
  fetchChatSessions,
  markChatRead,
  fetchChatsMentioning,
  interruptChat,
  followChat,
  regenerateChatAnswer,
  renameChat,
  streamChatMessage,
  setChatPinned,
  startChat,
  costAmount,
  fetchChatCommands,
  runChatCommand,
  spendKnown,
  thinkingTime,
  tokenCount,
  writingParts,
  readingShare,
} from '../../api/chat';
import type {
  ChatCall,
  ChatCommand,
  ChatMessage,
  ChatSession,
  ChatSpend,
  ChatStreamHandlers,
  Writing,
} from '../../api/chat';
import { givenUp } from '../../api/sse';
import { fetchInstallationSettings } from '../../api/installation';
import { fetchSkillOffers, reachableSkills } from '../../api/skills';
import type { SkillOffer } from '../../api/skills';
import {
  attachmentUrl,
  isAudible,
  isMidi,
  isPlayable,
  isShowable,
  formatSize,
  uploadAttachments,
} from '../../api/attachments';
import type { Attachment } from '../../api/attachments';
import { AttachmentSound } from '../../components/AttachmentSound';
import { AttachmentViewer } from '../../components/AttachmentViewer';
import { CallLine } from '../../components/CallLine';
import { ASK_EVERY_MS } from '../../components/NotificationBell';
import { InteractionCard, PLAN_KIND, placeRequests } from '../../components/InteractionCard';
import { ChatModeSwitch } from './ChatModeSwitch';
import { fetchSessionRequests, type InteractionRequest } from '../../api/interactions';
import { Thinking } from '../../components/Thinking';
import { CHUNKING_DEFAULT, readAloud } from '../../components/readAloud';
import type { Reading, SpeechChunking } from '../../components/readAloud';
import { transcribe } from '../../api/transcription';
import { fetchWorkspace } from '../../api/workspaces';
import { fetchWorkspaceAgents } from '../../api/agents';
import type { Agent } from '../../api/agents';
import { fetchChatReviews, fetchSessionReviewsOffered } from '../../api/ratings';
import { fetchCommandRunsOffered } from '../../api/commands';
import type { CommandRunOffer } from '../../api/commands';
import type { ChatReview } from '../../api/ratings';
import type { SessionUser } from '../../api/session';
import { fetchWorkspaces } from '../../api/workspaces';
import audioLinesIcon from '../../assets/audio-lines.svg';
import chevronDown12Icon from '../../assets/chevron-down-12.svg';
import copyIcon from '../../assets/copy.svg';
import cpuIcon from '../../assets/cpu.svg';
import penIcon from '../../assets/pen.svg';
import plusIcon from '../../assets/plus.svg';
import micIcon from '../../assets/mic.svg';
import refreshCwIcon from '../../assets/refresh-cw.svg';
import searchIcon from '../../assets/search.svg';
// Grey, not red: it sits in the title bar beside search and rename as one
// action among several, and the confirm is where the warning belongs.
import trashIcon from '../../assets/trash-grey.svg';
import volume2Icon from '../../assets/volume-2.svg';
import xIcon from '../../assets/x.svg';
import { AppShell } from '../../components/AppShell';
import { CatalogueNote, useCatalogue } from '../../components/Catalogue';
import { VoiceMeter } from '../../components/VoiceMeter';
import { VoiceMode } from '../../components/VoiceMode';
import { voicedTurn } from '../../components/voicedTurn';
import type { VoicedTurn } from '../../components/voicedTurn';
import type { VoiceModeHandle, VoicePhase, VoiceTurnTaking } from '../../components/VoiceMode';
import { Loader } from '../../components/Loader';
import { Markdown } from '../../components/Markdown';
import { useInlineCompletion } from '../../components/inlineCompletion';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ReviewDialog } from '../../components/ReviewDialog';
import { setSidebarCollapsed, useSidebarCollapsed } from '../../session/sidebar';
import { useInstallation } from '../../session/installation';
import { shellUser } from '../../session/user';
import { rememberWorkspace, useLastWorkspaceId } from '../../session/lastWorkspace';
import { FieldHint } from '../../components/FieldHint';
import { copyText } from '../../components/clipboard';
import { OpenDefinitionIcon } from '../../components/OpenDefinitionIcon';
import { ChatWidgets } from '../../components/ChatWidgets';
import { actOnChatWidget, fetchChatWidgets, removeChatWidget, type ChatWidget } from '../../api/widgets';
import styles from './ChatPage.module.css';
import { t, tf } from '../../i18n';
import { ChatEffort } from './ChatEffort';
import { zoned } from '../../session/timeZone';

export interface ChatPageProps {
  session: SessionUser;
  onSignOut?: () => void;
}

/** How many workspaces to look at when deciding which one to chat in. */
const WORKSPACE_LOOKUP = 100;

/**
 * What the answer being written now has thought and looked up.
 *
 * One of these belongs to one turn. See the `working` state for why none of it
 * is written down, and for the one part of it that is.
 */
interface Working {
  /** What the model thought, joined as the pieces arrive - the whole of it, which is what the message keeps. */
  thinking: string;
  /**
   * What it thought before its first call, which is all the section above the
   * calls shows. Thinking after a call is a line among the calls, so a model
   * that thinks, calls, and thinks again reads in that order rather than as
   * one block of thought above everything it did.
   */
  opening: string;
  /** How long the round before the first call thought, once the server has said. */
  openingMillis: number | null;
  /** The lookups it made, in the order it made them. */
  calls: ChatCall[];
  /**
   * Whether the conversation is being summarised before this turn is sent.
   *
   * A chat over its compaction threshold goes quiet for as long as a model
   * takes to read forty turns, with nothing on screen to say why — and "I
   * pressed Send and nothing happened" is what that looks like from the other
   * side. Issue #286.
   */
  compacting: boolean;
  /** What the model is writing now - a call being spelled out, or the answer - until the call arrives. */
  writing: Writing | null;
}

/** A turn that has done nothing yet, which is also what a new chat shows. */
/** How long a short-lived notice stays on screen. */
const PASSING_MS = 8000;

const NOTHING_YET: Working = { thinking: '', opening: '', openingMillis: null, calls: [], compacting: false, writing: null };

/** Whether there is anything of the working to draw. */
const anyWorking = (working: Working) =>
  working.thinking.trim() !== '' || working.calls.length > 0 || working.compacting || working.writing !== null;

/**
 * Chat.
 *
 * A chat is one conversation, and the history behind it is Spring AI's, keyed
 * by a conversation id the server holds. That is the same shape a workflow run
 * will use, so what is typed here and what an agent says in a run end up in the
 * same kind of thread.
 */
/** How long typing has to stop before what was said is worth asking about. */
const SEARCH_PAUSE_MS = 300;

/** A line that is nothing but one picture: what a tool's drawing is kept in the thread as. */
const PICTURE_ONLY = /^\s*!\[[^\]]*\]\([^)\s]+\)\s*$/;

export function ChatPage({ session, onSignOut }: ChatPageProps) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[] | null>(null);
  /*
   * Which chat is open, kept in the address bar.
   *
   * The URL is the state rather than a copy of it: a chat is a thing people
   * link to and reload, and a page that always opened the most recent one made
   * both of those impossible.
   */
  const { chatId = null } = useParams();
  const navigate = useNavigate();
  const currentId = chatId;

  /** Opens one, and says so in the address bar. */
  const setCurrentId = useCallback(
    (next: string | null | ((present: string | null) => string | null)) => {
      const chosen = typeof next === 'function' ? next(chatId) : next;
      if (chosen === chatId) return;
      // Replaced rather than pushed: moving between chats is not a trail
      // anybody wants to walk back through one Back press at a time.
      navigate(chosen === null ? '/chat' : `/chat/${chosen}`, { replace: true });
    },
    [chatId, navigate],
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState('');
  /** Off by default: most searches are for a chat by name, not through everything said. */
  const [searchInMessages, setSearchInMessages] = useState(false);
  /** The recorder while something is being said, and null the rest of the time. */
  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  /** The open microphone, for the meter to draw from while it is open. */
  const [listening, setListening] = useState<MediaStream | null>(null);
  /**
   * The same microphone, in a ref.
   *
   * Closing it has to be possible from a cleanup that runs as this page leaves,
   * and state read in a cleanup is whatever it was when that cleanup was made.
   */
  const microphone = useRef<MediaStream | null>(null);
  /** True once this page is on its way out, so nothing lands in it afterwards. */
  const leaving = useRef(false);
  const [transcribing, setTranscribing] = useState(false);
  /** What is attached to the message being written, and the menu that adds to it. */
  const [attached, setAttached] = useState<Attachment[]>([]);
  /** The timers and stopwatches the agent keeps in this chat, drawn above the composer. */
  const [widgets, setWidgets] = useState<ChatWidget[]>([]);
  const [attaching, setAttaching] = useState(false);
  /** What has already been sent with this chat, for opening again later. */
  /**
   * Whether a picture was drawn during the turn being answered.
   *
   * The files strip is read back from the server after a send, and it used to
   * be read back only when the send carried files of its own - so a picture
   * the model drew was filed against the chat, shown in the transcript, and
   * absent from the strip until the page was reloaded. A ref rather than
   * state: the handler that sets it and the code that reads it are in the same
   * run of the send, which never sees a state change made inside itself.
   */
  const drewPicture = useRef(false);
  /** The picture the viewer is showing, by id, or null when it is closed. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /**
   * Which answer is being read aloud, by its place in the log.
   *
   * One at a time: two voices over each other is nobody's idea of listening, so
   * starting one stops the other. `fetching` is separate from `playing` because
   * synthesising a long answer takes seconds, and a button that looks inert for
   * those seconds gets pressed again.
   */
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [fetchingSpeech, setFetchingSpeech] = useState<number | null>(null);
  /** How much of the answer being read aloud has been heard, 0 to 1; null while nothing is. */
  const [speechHeard, setSpeechHeard] = useState<number | null>(null);
  /**
   * The reading in flight, so a second press can stop the first.
   *
   * One object per reading rather than a ticket compared against a counter: the
   * reading is a sentence at a time now, so what a stop has to reach is a queue,
   * a request in the air and a clip playing, and holding all three together is
   * the only way none of them is forgotten.
   */
  const reading = useRef<Reading | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  /** Whether this installation allows files at all; the button is absent when not. */
  const [attachmentsAllowed, setAttachmentsAllowed] = useState(false);
  /** Whether reviews can be sent, which adds an entry to the same menu. */
  const [reviewsOffered, setReviewsOffered] = useState(false);
  /** The shell blocks an answer may run, by language; none until the server says, and none for most people. */
  const [runOffer, setRunOffer] = useState<CommandRunOffer | undefined>(undefined);
  /** The chat being reviewed, while the dialog is open. */
  const [reviewing, setReviewing] = useState<string | null>(null);
  /** The reviews this chat has had, drawn in the thread where they were sent. */
  const [reviews, setReviews] = useState<ChatReview[]>([]);
  /** Whether files are being dragged over the chat, which then says it will take them. */
  const [dropping, setDropping] = useState(false);
  /** The chat whose model is being asked for a title, while it is. */
  const [naming, setNaming] = useState<string | null>(null);
  /** The chats whose messages match, as the server last answered. */
  const [mentioning, setMentioning] = useState<string[]>([]);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  /** Which agent the arrow keys are on, by id; null until one is pressed. */
  const [pickerFocus, setPickerFocus] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  /*
   * The commands this workspace offers, asked of the server. Issue #343.
   *
   * Read once per workspace rather than per keystroke: the catalogue is a fact
   * about the installation, and a menu that fetched while somebody typed would
   * open empty and fill in under them.
   */
  const [commands, setCommands] = useState<ChatCommand[]>([]);
  /** Which row of the slash menu is under the caret. */
  const [commandAt, setCommandAt] = useState(-1);
  /*
   * Whether the menu was put away for the line being typed.
   *
   * Its own state rather than emptying the catalogue, which is what this did at
   * first: the catalogue is a fact about the workspace, and clearing it to close
   * a menu meant the menu never opened again for the rest of the session. It is
   * cleared by typing, because the next character is somebody starting again.
   */
  const [commandsShut, setCommandsShut] = useState(false);
  /*
   * Every skill the workspace can name, for the menu the command marker opens.
   * Which of them this chat's agent reaches is worked out per render, since
   * the agent can change under an open composer.
   */
  const [skillOffers, setSkillOffers] = useState<SkillOffer[]>([]);
  /** The workspace's marker - its own, or the installation's it follows - once read. */
  const [workspaceMarker, setWorkspaceMarker] = useState<string | null>(null);
  /** The installation's marker, for a page whose workspace answered nothing. */
  const [installationMarker, setInstallationMarker] = useState<string | null>(null);
  /** Where the caret is in the composer, since a skill command may be any word. */
  const [caret, setCaret] = useState(0);
  /** Which row of the skill menu is under the caret. */
  const [skillAt, setSkillAt] = useState(-1);
  /** Where to put the caret once a completed word has been drawn into the box. */
  const caretAfter = useRef<number | null>(null);
  const [sending, setSending] = useState(false);

  /*
   * The chat's widgets, read when it opens and again when a turn ends - a turn
   * the page was not watching may have changed them. During a turn the stream
   * says so as it happens.
   */
  useEffect(() => {
    if (currentId === null || sending) return;
    let wanted = true;
    fetchChatWidgets(currentId)
      .then((held) => {
        if (wanted) setWidgets(held);
      })
      .catch(() => {
        if (wanted) setWidgets([]);
      });
    return () => {
      wanted = false;
    };
  }, [currentId, sending]);
  /** Whether the person wrote into the turn now running; the history then holds it where the agent read it. */
  const wroteDuringTurn = useRef(false);
  /** A message written as the turn ended, too late for it: sent as a turn of its own once the page is free. */
  const sendAfterTurn = useRef<string | null>(null);
  const composerForm = useRef<HTMLFormElement>(null);
  /*
   * When the turn is over: a message written into it is in the history now,
   * where the agent read it, so the history is read back to show it there rather
   * than leaving it in the turn's working that the next send clears. And one
   * that came too late for the turn goes now as a turn of its own.
   */
  useEffect(() => {
    if (sending) return;
    if (wroteDuringTurn.current && currentId !== null) {
      wroteDuringTurn.current = false;
      // The history holds the calls and asides too, so the turn's live account of them goes.
      fetchChatMessages(currentId)
        .then((held) => {
          setMessages(held);
          setWorking(NOTHING_YET);
        })
        .catch(() => undefined);
    }
    const late = sendAfterTurn.current;
    if (late !== null) {
      sendAfterTurn.current = null;
      setDraft(late);
      window.setTimeout(() => composerForm.current?.requestSubmit(), 0);
    }
  }, [sending, currentId]);
  /**
   * The request answering the turn in flight, so it can be stopped.
   *
   * A ref rather than state because nothing on the screen is drawn from it —
   * `sending` is what the composer reads — and because the handler that aborts
   * it has to reach the one that is running now rather than the one that was
   * running when its closure was made.
   *
   * Every door into the model puts its controller here: a typed send, a spoken
   * turn, and asking for the answer again. One at a time, because a chat only
   * ever has one answer being written.
   */
  const asking = useRef<AbortController | null>(null);
  /**
   * Which chat is on screen, for a turn that ends after the page has moved on.
   *
   * A send's stream is let go of when the chat changes - the answer goes on
   * being written on the server and is picked up again by following (#201) -
   * and the send then ends in its `catch`, where it used to read the history
   * back. Read back for the chat it was sent to, onto whichever chat is open
   * now, it put one conversation's messages under another's name.
   */
  const openChat = useRef<string | null>(null);
  /**
   * What the last answer took and cost; the log shows it under the model's name.
   *
   * The last answer only, and held in state rather than on the message, because
   * none of it is written down: the history keeps what was said. An answer read
   * back off the server after a reload has no time behind it and no cost either,
   * which is the honest answer rather than a gap to be filled with noughts.
   */
  const [lastSpend, setLastSpend] = useState<ChatSpend | null>(null);
  /** A short-lived notice, such as a chat its model could not name. */
  const [passing, setPassing] = useState<string | null>(null);
  /**
   * What the answer being written now is thinking, and what it has looked up.
   *
   * The working of one turn, held beside the log rather than in it, for the same
   * reason `lastSpend` is: none of it is in the chat history. The history is
   * Spring AI's store and keeps a role, some text and an order — what a model
   * thought is not something anybody said, and a lookup is not a turn.
   *
   * ## So it is not kept, and that is a decision
   *
   * Issue #227 reached this boundary with the cost of an answer and settled it
   * the same way: the number is shown on the answer it belongs to and is gone on
   * reload, because inventing a messages table to hold it is the one thing the
   * architecture rules out. Thinking is a much larger version of the same
   * question — kilobytes per answer rather than three integers — and the case
   * for keeping it is weaker, not stronger: it is the model talking to itself,
   * it is never sent back to the model, and nothing downstream reads it.
   *
   * The lookups are the exception that proves it. They *are* kept, because they
   * were already being kept for another reason: an agent chat records its round
   * into an LLM session, which is a transcript in its own right, and the log
   * puts them back off that when the page loads. So a reload keeps the calls and
   * loses the thinking, which is exactly what each of them is worth.
   *
   * ## Cleared at the start of a turn, not at the end of one
   *
   * It stays on screen once the answer lands: somebody reads the answer and then
   * asks why it says that. The next send is what clears it, since by then it is
   * working that belongs to a turn further up the log with no way to draw it
   * there.
   */
  const [working, setWorking] = useState<Working>(NOTHING_YET);
  /**
   * The thinking accumulated for the turn in flight, for `onDone` to read.
   *
   * A ref beside the state rather than instead of it: the state is what draws
   * the block as the pieces land, and this is what the end of the stream reads
   * to put the finished thinking on the message itself. Once it is there, live
   * and reloaded draw from the same place.
   */
  const thinkingSoFar = useRef('');
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The message whose copy button was just pressed, and whether the text reached the clipboard. Issue #589. */
  const [copied, setCopied] = useState<{ index: number; ok: boolean } | null>(null);
  /**
   * Which take of an answer is being read, for the answers that have more than
   * one, by their place in the log.
   *
   * Absent means the one that stands, which is what every answer shows until
   * somebody steps back through it — and what an answer goes back to showing
   * the moment it is asked for again. Cleared with the chat, since the numbers
   * are places in a log that has been replaced.
   */
  const [takeAt, setTakeAt] = useState<Record<number, number>>({});

  const logRef = useRef<HTMLDivElement>(null);
  /*
   * The same element, as state.
   *
   * A ref alone cannot say *when* it was attached, and this one is attached on a
   * render that changes neither the turns nor which chat is open - so an effect
   * keyed on those two ran three times with nothing to scroll and never again
   * once there was. Holding it as state makes the attachment itself the thing
   * the effect waits for.
   */
  const [logBox, setLogBox] = useState<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Set when the collapsed search icon was the thing that opened the column. */
  const wantsSearch = useRef(false);
  /** The chat a delete is being asked about, or null when nothing is. */
  const [deleting, setDeleting] = useState<ChatSession | null>(null);
  /*
   * Finding something in the conversation that is open.
   *
   * A different act from the sidebar's box, which asks "which chat was that
   * in" and filters a list of titles. This one asks "where in this one did we
   * say that", and the answer is a position in the log. The magnifier in the
   * title bar used to do neither - it focused a hidden input - and then, for a
   * while, the first one, which is the wrong question for a control that sits
   * above the conversation rather than above the list.
   */
  const [finding, setFinding] = useState(false);
  const [find, setFind] = useState('');
  const [findAt, setFindAt] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);

  /*
   * Which turns carry what is being looked for.
   *
   * Whole messages rather than the run of characters inside one: an answer is
   * drawn as markdown, so highlighting a substring there means reaching into
   * rendered output rather than text. A conversation is read a turn at a time
   * anyway - what somebody wants is to be taken to the exchange, and the
   * exchange is the unit the eye is already using.
   */
  const findHits = useMemo(() => {
    const needle = find.trim().toLowerCase();
    if (needle === '') return [];
    return messages.reduce<number[]>((found, message, index) => {
      if (message.content.toLowerCase().includes(needle)) found.push(index);
      return found;
    }, []);
  }, [find, messages]);

  /* A new search starts at its first hit, not wherever the last one had got to. */
  useEffect(() => {
    setFindAt(0);
  }, [find]);

  /* Taking the reader to the hit is the whole point; nothing else moves. */
  useEffect(() => {
    if (findHits.length === 0) return;
    const at = logRef.current?.querySelector('[data-find="at"]');
    at?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [findAt, findHits]);

  const stepFind = (by: number) => {
    if (findHits.length === 0) return;
    setFindAt((was) => (was + by + findHits.length) % findHits.length);
  };

  const closeFind = () => {
    setFinding(false);
    setFind('');
    setFindAt(0);
  };

  /**
   * What to mark a turn with: the one being looked at, one of the others that
   * matched, or nothing.
   */
  /**
   * A message's send time, drawn only where the workspace shows them.
   *
   * Null for a line carried in from the session this chat continues - it was
   * said before the chat existed - and for a live turn until the reload that
   * reads its stored time back. Both read as no time rather than a guessed one.
   * The date is on every line, today's included, so a chat read on another
   * day says the same of each line as it did on the day it was written.
   */
  const sentAt = (at: string | null): string | null => {
    if (!showTimestamps || at === null) return null;
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) return null;
    return when.toLocaleString([], zoned({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
  };

  /**
   * When a tool was called, to the second, beside its name. Always drawn, unlike
   * a message's time: a turn that ran five minutes is read by which call took
   * them, and that is only legible with the clock on every call.
   */
  const calledAt = (at: string | number | null | undefined): string | undefined => {
    if (at === null || at === undefined) return undefined;
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) return undefined;
    return when.toLocaleTimeString([], zoned({ hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

    const findMark = (index: number): string | undefined => {
    if (findHits.length === 0) return undefined;
    if (findHits[findAt] === index) return 'at';
    return findHits.includes(index) ? 'hit' : undefined;
  };
  const collapsed = useSidebarCollapsed();

  /*
   * The search box does not exist while the column is collapsed, so the caret
   * cannot be put in it until after it opens and renders.
   */
  useEffect(() => {
    if (collapsed || !wantsSearch.current) return;
    wantsSearch.current = false;
    searchRef.current?.focus();
  }, [collapsed]);

  /*
   * The workspace last looked at, which is what this page is about when no chat
   * names one for it — but only after checking that one still exists. A
   * remembered id outlives the workspace it points at (anything that rebuilds
   * the database gives them new ids), and a screen that trusts it asks about a
   * workspace nobody can see and quietly does nothing.
   *
   * Watched rather than read once. The selector in the corner leaves this page
   * where it is now, so it is the only thing that says the chat is about
   * another workspace — read at mount, switching looked like it had done
   * nothing at all (issue #250).
   */
  const remembered = useLastWorkspaceId();
  /**
   * What `remembered` was the last time this ran, so a switch can be told from
   * an arrival.
   *
   * The two want opposite answers from the same pair of values. Arriving at a
   * chat's address, the chat decides and the corner has to follow it; choosing
   * a workspace in the corner, the corner decides and the chat has to be let go
   * of. Without this the second is impossible - the chat named in the address is
   * still named there at the moment of the switch, so a rule that always asked
   * it would pin the page to the workspace being left (issue #250 again, from
   * the other side).
   */
  const lastRemembered = useRef(remembered);
  /**
   * Which workspace's conversations the page is waiting for.
   *
   * A fetch that was already in flight when the corner moved lands after the
   * new one, and puts the workspace that was left back on screen: the list, and
   * with it the chat the address bar names, because a chat missing from the new
   * list is dropped and one found in the old is kept.
   */
  const wanted = useRef<string | null>(null);

  useEffect(() => {
    let abandoned = false;
    const switched = lastRemembered.current !== remembered;
    lastRemembered.current = remembered;

    /*
     * Which workspace this chat is about.
     *
     * A chat belongs to a workspace and says so, and until #861 this page never
     * asked: it took whichever workspace was last looked at, and fell through to
     * the first one in the list when nothing had been. So `/chat/:id` opened from
     * a link, a bookmark or a fresh browser drew the conversation under somebody
     * else's workspace - the agents picker, the models voice mode needs, where
     * attachments go and every link out of the page.
     *
     * Only when the corner has not just moved, and only for a chat that is
     * really there in a workspace this account can see. Anything else falls back
     * to what was remembered, which is what a chat with no id in the address has
     * always done.
     */
    async function decide(): Promise<string | null> {
      if (switched || chatId === null) return null;
      const held = await fetchChatSession(chatId).catch(() => null);
      return held?.workspaceId ?? null;
    }

    Promise.all([fetchWorkspaces(0, WORKSPACE_LOOKUP), decide()])
      .then(([page, itsOwn]) => {
        if (abandoned) return;
        const live =
          page.content.find((entry) => entry.id === itsOwn) ??
          page.content.find((entry) => entry.id === remembered) ??
          page.content[0];
        wanted.current = live?.id ?? null;
        setWorkspaceId(live?.id ?? null);
        // So the corner names what the page is about. A selector still reading
        // the workspace somebody came from, over a chat belonging to another,
        // is the same wrong answer drawn in a second place.
        if (live !== undefined) rememberWorkspace(live.id);
        if (live === undefined) setError(t('There is no workspace to chat in yet.'));
      })
      .catch((cause: unknown) => {
        if (abandoned) return;
        setWorkspaceId(null);
        setError(cause instanceof Error ? cause.message : t('Could not find a workspace to chat in.'));
      });
    return () => {
      abandoned = true;
    };
  }, [remembered, chatId]);

  /*
   * The chat on screen is read: when it is opened, and whenever the list says
   * something arrived in it while it was open - an answer, an agent's wake-up.
   * Cleared here at once, and told to the server, which keeps the count.
   */
  const currentUnread = sessions?.find((entry) => entry.id === currentId)?.unreadCount ?? 0;
  /*
   * Only while somebody is looking: an answer that arrives in the open chat of
   * a window in the background - the desktop app waiting in the tray, a tab
   * behind another - is news until they come back, not read the moment it
   * lands. Coming back to the window reads it.
   */
  const [looking, setLooking] = useState(() => document.visibilityState === 'visible' && document.hasFocus());
  useEffect(() => {
    const now = () => setLooking(document.visibilityState === 'visible' && document.hasFocus());
    window.addEventListener('focus', now);
    window.addEventListener('blur', now);
    document.addEventListener('visibilitychange', now);
    return () => {
      window.removeEventListener('focus', now);
      window.removeEventListener('blur', now);
      document.removeEventListener('visibilitychange', now);
    };
  }, []);
  useEffect(() => {
    if (currentId === null || !looking) return;
    setSessions((held) => held?.map((entry) => (entry.id === currentId && entry.unreadCount !== 0 ? { ...entry, unreadCount: 0 } : entry)) ?? held);
    void markChatRead(currentId).catch(() => undefined);
  }, [currentId, currentUnread, looking]);

  /*
   * The list again - counts and names only, never which chat is open - on the
   * bell's beat and whenever the window is come back to. An answer finished in
   * a chat somebody left, or a reminder an agent set, had no way to show its
   * count until something else reloaded the list.
   */
  /**
   * The list again, counts and names only; never which chat is open. The
   * workspace from the ref rather than this render: a chat's watch outlives the
   * render that started it, which may be from before the workspace was known.
   */
  function refreshCounts() {
    const asked = wanted.current;
    if (asked === null) return;
    fetchChatSessions(asked)
      .then((loaded) => {
        if (wanted.current === asked) setSessions(loaded);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    if (workspaceId === null) return undefined;
    const asked = workspaceId;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      fetchChatSessions(asked)
        .then((loaded) => {
          if (wanted.current === asked) setSessions(loaded);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, ASK_EVERY_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [workspaceId]);

  const loadSessions = useCallback(
    async (select?: string) => {
      if (workspaceId === null) return;
      const loaded = await fetchChatSessions(workspaceId);
      // Somebody has chosen another workspace since this was asked for. Its
      // answer is about a page nobody is looking at any more.
      if (wanted.current !== workspaceId) return;
      setSessions(loaded);
      // Nothing in the address bar means "open the most recent one", which is
      // what somebody arriving at /chat expects; a chat named there wins.
      //
      // A chat that is not in this list is not this workspace's — the corner
      // changed what the page is about, or the chat was deleted somewhere else
      // — and holding on to its id draws the empty state over a workspace full
      // of conversations.
      setCurrentId((present) => {
        if (select !== undefined) return select;
        if (present !== null && loaded.some((entry) => entry.id === present)) return present;
        return loaded[0]?.id ?? null;
      });
    },
    [workspaceId, setCurrentId],
  );

  /*
   * What can be typed instead of said, read once per workspace.
   *
   * A catalogue is a fact about the installation rather than about the line
   * being typed, so a menu that fetched per keystroke would open empty and fill
   * in under somebody. An installation that answers nothing simply has no menu:
   * the slash is then a slash, which is what it was before this existed.
   */
  useEffect(() => {
    if (workspaceId === null) return;
    let abandoned = false;
    fetchChatCommands(workspaceId)
      .then((held) => {
        if (!abandoned) setCommands(held);
      })
      .catch(() => {
        if (!abandoned) setCommands([]);
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    setSkillOffers([]);
    if (workspaceId === null) return;
    let abandoned = false;
    fetchSkillOffers(workspaceId)
      .then((held) => {
        if (!abandoned) setSkillOffers(held);
      })
      .catch(() => undefined);
    return () => {
      abandoned = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId === null) return;
    /*
     * Only once the page and the corner agree which workspace this is.
     *
     * Between the two there is a moment - the corner has moved, the effect
     * above has not answered yet - when this would fetch the conversations of
     * the workspace being left. That answer is not merely stale: the address
     * bar has no chat in it at that point, so the newest chat of the old
     * workspace is opened, and the effect above then reads that chat and moves
     * the whole page back to where it came from. Waiting is what stops the
     * switch fighting itself.
     */
    if (workspaceId !== remembered) return;
    void loadSessions().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : t('Could not load the chats.')),
    );
  }, [workspaceId, remembered, loadSessions]);

  /*
   * What the chat can be pointed at.
   *
   * The models were fetched beside this and are not any more: a chat is pointed
   * at an agent, and the agent brings its model (issue #295). The model's *name*
   * is still shown for a chat that was started on a bare model, but that comes
   * off the chat itself as `modelName` rather than out of a list.
   *
   * A catalogue rather than a plain fetch, and it matters here more than it did.
   * It used to end `.catch(() => setAgents([]))`, which meant a server that had
   * gone away left a picker saying this workspace has no agents - and that
   * sentence now carries "add one" behind it, so getting it wrong sends somebody
   * off to build an agent they already have.
   */
  /**
   * Whether the agents have actually been counted, as opposed to not asked for
   * yet.
   *
   * `loading` cannot answer this on its own. It starts false while the workspace
   * is still being worked out, and there is one render between the workspace
   * arriving and the effect setting it true - one frame in which an empty list
   * is indistinguishable from a counted one. That frame is enough to flash "No
   * agent to chat with" across the top of a workspace that has a dozen.
   */
  const [counted, setCounted] = useState(false);
  const agentCatalogue = useCatalogue<Agent>(
    'agents in this workspace',
    async () => (await fetchWorkspaceAgents(workspaceId ?? '', 0, 100)).content,
    [workspaceId],
    { skip: workspaceId === null, onLoaded: () => setCounted(true) },
  );
  const agents: Agent[] = agentCatalogue.items;

  /*
   * What the open chat holds.
   *
   * Cleared before the fetch, not after: leaving the old conversation on screen
   * until the new one arrives showed somebody else's messages under the name
   * they had just clicked. An answer that lands after the chat has changed
   * again is dropped for the same reason.
   */
  useEffect(() => {
    setMessages([]);
    setLastSpend(null);
    // Working belongs to the turn that produced it, and that turn is in the
    // chat being left. Carried across it would sit under somebody else's answer.
    setWorking(NOTHING_YET);
    thinkingSoFar.current = '';
    setTakeAt({});
    openChat.current = currentId;
    if (currentId === null) return;

    let live = true;
    /*
     * The answer being written on this chat, if one is, picked up once the
     * history is on screen - after it, because the answer is drawn onto the end
     * of what the history holds. Issue #201: a page that came back while the
     * agent was still thinking used to show the question and nothing else, for
     * good.
     */
    const following = new AbortController();
    fetchChatMessages(currentId)
      .then(async (held) => {
        if (!live) return;
        setMessages(held);
        await followAnswer(currentId, following, () => live);
        /*
         * Then wait for a turn nobody on this page asked for: a watcher firing
         * or a reminder coming due wakes the agent on the server, and its answer
         * used to reach the history and not the page until a reload. One
         * controller per turn, so Stop on a woken answer ends that answer and
         * not the waiting.
         */
        while (live) {
          const one = new AbortController();
          const leave = () => one.abort();
          following.signal.addEventListener('abort', leave);
          const began = Date.now();
          const picked = await followAnswer(currentId, one, () => live, true);
          following.signal.removeEventListener('abort', leave);
          // A wait that ended at once is a server that is not there; do not ask it again in a loop.
          if (!picked && Date.now() - began < 1_000) await new Promise((done) => setTimeout(done, 5_000));
        }
      })
      .catch(() => undefined);
    const left = currentId;
    return () => {
      live = false;
      following.abort();
      /*
       * And whatever this page was reading for the chat being left. Only the
       * reading stops: a text turn goes on being written on the server, and the
       * chat picks it up again by following when it is opened. Stop is the one
       * thing that ends a turn, and it says so to the server itself.
       */
      if (asking.current !== null) {
        asking.current.abort();
        asking.current = null;
        setSending(false);
        if (left !== null) watchLeft(left);
      }
    };
    // `followAnswer` is a plain function of this render; what it reads is
    // refs and setters, so the one made by the render that opened the chat is
    // as good as any later one.
  }, [currentId]);

  /*
   * An answer still being written in a chat somebody has just left: followed
   * quietly, drawing nothing, so the counts are read the moment it ends. The
   * page stops reading a chat it leaves, and until this an answer finished
   * there showed its count only at the list's next once-a-minute read - so
   * somebody waiting in the window saw nothing come.
   */
  function watchLeft(id: string) {
    const quiet = () => undefined;
    const watching = new AbortController();
    const unmounting = () => watching.abort();
    window.addEventListener('pagehide', unmounting, { once: true });
    followChat(
      id,
      { onChunk: quiet, onThinking: quiet, onDrew: quiet, onCall: quiet, onCalled: quiet, onDone: quiet, onError: quiet },
      watching.signal,
    )
      .catch(() => undefined)
      .finally(() => {
        window.removeEventListener('pagehide', unmounting);
        if (!watching.signal.aborted) refreshCounts();
      });
  }

  /*
   * Clicking away closes it, the way every other menu here behaves.
   *
   * Escape too: a list opened by mistake should not need somebody to find the
   * button again to put it back.
   */
  useEffect(() => {
    if (!pickerOpen) return;

    function onDown(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    }

    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setPickerOpen(false);
    }

    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  /*
   * The newest turn is the thing you are looking at, on arrival as well as after.
   *
   * This used to depend on `messages` alone, and opening a chat never scrolled:
   * the turns are fetched while the log is still behind its loading state, so
   * the effect ran with `logRef.current` null, and nothing changed afterwards to
   * run it again. A chat of six thousand pixels opened at the top of the first
   * thing anybody had said.
   *
   * So it also watches which chat is open, and the reviews drawn at its foot,
   * which arrive after the turns do, and asks for the frame after the one
   * it is on: a run of markdown is laid out by then, where at effect time the
   * box can still be shorter than what is in it. An image arriving later moves
   * the floor again, which is what the observer is for - it keeps the newest
   * turn in view until somebody scrolls away from it themselves.
   */
  /*
   * Whether the log is following its foot, kept across renders.
   *
   * It was decided afresh on every change to the turns, so a reader who had
   * scrolled up was pulled back down by the next piece of an answer. And it was
   * turned off by any scroll event that found the foot more than 40px away -
   * including the one the log's own scroll raises a frame later, by which time
   * more of the answer can have landed: the log took its own scroll for the
   * reader leaving and stopped following, and the end of an answer grew out of
   * sight. Now only a scroll upward turns it off, coming back near the foot
   * turns it on, and a new chat or a new message of the person's own starts it
   * again - they have just said something, and the answer is what they are
   * waiting to read.
   */
  const following = useRef(true);
  const personSaid = useRef(0);
  useEffect(() => {
    following.current = true;
  }, [currentId]);
  useEffect(() => {
    const said = messages.filter((one) => one.role === 'user').length;
    if (said > personSaid.current) following.current = true;
    personSaid.current = said;
  }, [messages]);

  useEffect(() => {
    const log = logBox;
    if (log === null) return;

    let lastTop = log.scrollTop;
    const toBottom = () => {
      if (!following.current) return;
      log.scrollTo({ top: log.scrollHeight });
      lastTop = log.scrollTop;
    };

    const frame = requestAnimationFrame(toBottom);
    // Reading up is a decision; nothing below should undo it.
    const onScroll = () => {
      const near = log.scrollHeight - log.clientHeight - log.scrollTop < 40;
      if (near) following.current = true;
      else if (log.scrollTop < lastTop - 2) following.current = false;
      lastTop = log.scrollTop;
    };
    log.addEventListener('scroll', onScroll, { passive: true });
    /*
     * And the reader's own gesture upward, heard before the frame it moves: a
     * piece of the answer landing in that same frame would otherwise scroll
     * them back down before the scroll event said they had left.
     */
    const onWheel = (event: globalThis.WheelEvent) => {
      if (event.deltaY < 0) following.current = false;
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (['PageUp', 'Home', 'ArrowUp'].includes(event.key) && event.target === log) following.current = false;
    };
    const onTouch = () => {
      following.current = false;
    };
    log.addEventListener('wheel', onWheel, { passive: true });
    log.addEventListener('keydown', onKey);
    log.addEventListener('touchmove', onTouch, { passive: true });

    const grew = new ResizeObserver(toBottom);
    grew.observe(log);
    for (const child of Array.from(log.children)) grew.observe(child);
    /*
     * And what is added between the renders this effect follows. A question an
     * agent asks arrives with its own fetch, after the turn that asked it was
     * drawn, as a new row nothing above was watching - so the log stayed where
     * it was and the question sat below the fold.
     */
    const added = new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of Array.from(change.addedNodes)) if (node instanceof Element) grew.observe(node);
      }
      toBottom();
    });
    added.observe(log, { childList: true });

    return () => {
      added.disconnect();
      cancelAnimationFrame(frame);
      log.removeEventListener('scroll', onScroll);
      log.removeEventListener('wheel', onWheel);
      log.removeEventListener('keydown', onKey);
      log.removeEventListener('touchmove', onTouch);
      grew.disconnect();
    };
  }, [messages, reviews, currentId, logBox]);

  /*
   * The box is as tall as what has been typed into it, up to the top of the
   * screen.
   *
   * It was one line and a `max-height` of 200px, which meant Shift+Enter put a
   * second line somewhere the writer could not see: the field kept its 20px and
   * scrolled, so a message being composed was read through a slot. A cap in
   * pixels is the same mistake written differently - it is a guess at how much
   * room there is, made in a stylesheet that cannot see the window.
   *
   * So the cap is measured instead. The column is header, conversation and
   * composer, and the conversation is the only part of it that yields: what the
   * box can still take is what the log is holding *inside its own padding*.
   * Padding does not shrink, so counting the log's whole height would let the
   * composer grow 64px further than there is room for, and a flex column with
   * nothing left to give overflows rather than resisting - the header goes off
   * the top of the window and the growth never stops. At the cap - the top of
   * the conversation area, which is what "up to the top" means - it scrolls
   * like any other overflowing box.
   *
   * The log is measured *before* the height is reset, because resetting it to
   * `auto` collapses the box to one line and hands the difference straight back
   * to the log: read after, the room would be counted twice and the box would
   * grow past the top on the first Shift+Enter.
   *
   * A layout effect rather than an effect: this runs between React writing the
   * DOM and the browser painting it, so a line is never drawn at the old height
   * first.
   */
  /**
   * Sizes the box to what it holds, or to [atLeast] where something drawn over
   * it - a suggested continuation - needs more, never past the room the log
   * can give up.
   */
  const fitComposer = (box: HTMLTextAreaElement, atLeast = 0) => {
    const log = logRef.current;
    const around = log === null ? null : window.getComputedStyle(log);
    const yields =
      log === null || around === null
        ? 0
        : Math.max(0, log.clientHeight - parseFloat(around.paddingTop) - parseFloat(around.paddingBottom));
    // Its own height counts: what the box already occupies is room it is
    // holding, not room it has to find. Which is also why this can never fall
    // below one line, whatever the log is doing.
    const room = box.clientHeight + yields;
    box.style.height = 'auto';
    const wanted = Math.max(box.scrollHeight, atLeast);
    const height = Math.min(wanted, room);
    box.style.height = `${height}px`;
    // Only when it has stopped growing, so the scrollbar is not drawn over a
    // box that had room for the line all along.
    box.style.overflowY = wanted > height ? 'auto' : 'hidden';
  };

  useLayoutEffect(() => {
    const box = composerRef.current;
    if (box === null) return;
    fitComposer(box);
    // fitComposer reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, attached, currentId]);

  const current = sessions?.find((entry) => entry.id === currentId) ?? null;
  /*
   * A review is offered only once there is something to review: the server
   * refuses a chat with no session and no answer, so the entry would only lead
   * to that refusal.
   */
  const reviewable =
    reviewsOffered &&
    current !== null &&
    (current.llmSessionId !== null || messages.some((message) => message.role === 'assistant' && message.content !== ''));

  /*
   * Questions the agent put to the person here - may it expose a port, and
   * whatever asks next - drawn among the messages where they were asked. Read
   * again whenever a call finishes, since asking is a call, and when the page
   * comes back into view, since an answer can be changed on the session page.
   */
  const [requests, setRequests] = useState<InteractionRequest[]>([]);
  const requestsSession = current?.llmSessionId ?? null;
  const finishedCalls = working.calls.filter((call) => call.result !== null).length;
  const loadReviews = useCallback(() => {
    if (currentId === null) {
      setReviews([]);
      return;
    }
    fetchChatReviews(currentId)
      .then(setReviews)
      .catch(() => setReviews([]));
  }, [currentId]);
  /*
   * Again as answers land, and as each of the agent's calls comes back:
   * rate_session sends one from inside a turn, after the answer's own line is
   * already on the page, so the count of messages does not move and the
   * review waited for a reload. And once more when the turn is over.
   */
  useEffect(loadReviews, [loadReviews, messages.length, finishedCalls, sending]);

  const loadRequests = useCallback(() => {
    if (requestsSession === null) {
      setRequests([]);
      return;
    }
    fetchSessionRequests(String(requestsSession))
      .then(setRequests)
      .catch(() => undefined);
  }, [requestsSession]);
  useEffect(loadRequests, [loadRequests, messages.length, finishedCalls]);
  /*
   * A plan answered can take the chat out of plan mode on the server, so the
   * switch in the composer reads the chat back rather than guessing. #653.
   */
  const answeredRequest = useCallback(
    (answered: InteractionRequest) => {
      loadRequests();
      if (answered.kind !== PLAN_KIND || currentId === null) return;
      fetchChatSession(currentId)
        .then((fresh) => {
          if (fresh === null) return;
          setSessions((held) => held?.map((one) => (one.id === fresh.id ? { ...one, mode: fresh.mode } : one)) ?? held);
        })
        .catch(() => undefined);
    },
    [loadRequests, currentId],
  );
  useEffect(() => {
    window.addEventListener('focus', loadRequests);
    return () => window.removeEventListener('focus', loadRequests);
  }, [loadRequests]);
  /*
   * Where each question goes.
   *
   * An open one is drawn at the bottom, just above the composer, whatever the
   * turn is doing: it is waiting for the person, and a question scrolled up
   * among the calls of a turn still running is one nobody sees. Answered, it
   * goes back to when it was asked - among the calls of the turn it was asked
   * in while that turn's working is on screen, and among the lines the history
   * carries, by time, once it is read back.
   */
  const openRequests = requests.filter((request) => request.chosen === null);
  const answeredRequests = requests.filter((request) => request.chosen !== null);
  /*
   * The turn on screen began with the person's last message; a question asked
   * since belongs among its calls for as long as they are drawn - the answer
   * that ends the turn is dated when it lands, and is not where it was asked.
   */
  const lastAsked = [...messages].reverse().find((message) => message.role === 'user' && message.at !== null)?.at ?? null;
  const turnRequests =
    working.calls.length > 0 && lastAsked !== null
      ? answeredRequests.filter((request) => Date.parse(request.createdAt) > Date.parse(lastAsked))
      : [];
  /** Each review before the first line said after it, or at the end. */
  /*
   * A picture a tool drew is kept in the thread as an assistant line of its
   * own, written the moment it was drawn and before the answer the turn went
   * on to give. Drawn as that, it was a second message from the agent - and
   * one above the tool call that made it. So a line that is only a picture is
   * drawn inside the answer that follows it, after that answer's working, and
   * not as a message of its own. The thread is left as it is: what is stored,
   * a reload and a regenerate all still see the picture's own line.
   *
   * Every picture of a run goes to the answer after the run, not only the last:
   * the home was the next assistant line, which for all but the last picture is
   * another picture, so a turn that drew four drew three of them as messages.
   */
  const carried = new Set<number>();
  const picturesFor = new Map<number, string[]>();
  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || !PICTURE_ONLY.test(message.content)) return;
    const home = messages.findIndex(
      (later, at) =>
        at > index && (later.role === 'user' || (later.role === 'assistant' && !PICTURE_ONLY.test(later.content))),
    );
    if (home === -1 || messages[home].role !== 'assistant') return;
    carried.add(index);
    picturesFor.set(home, [...(picturesFor.get(home) ?? []), message.content]);
  });
  /** The pictures the working on screen draws among its calls, which the last answer does not draw again. */
  const drawnInTurn = new Set(working.calls.flatMap((call) => (call.drew === undefined ? [] : [call.drew])));

  /*
   * An agent's turn is one message, however many lines the thread keeps it in.
   *
   * Read back, a turn is several: what the agent said between its calls, each
   * call, each round's thinking, the pictures it drew and the answer - and each
   * line that was the agent's drew its own avatar, name, time and Copy, so one
   * turn of chat 979 read as three messages. Everything between one thing the
   * person said and the next is now one turn: the first line that is drawn
   * carries the one header, the rest follow under it without one, and only the
   * answer - the turn's last line of text - has the actions. A line drawn
   * inside another (a picture carried into the answer) is not a line of its
   * own here either.
   */
  const turnHead = new Set<number>();
  /** Each line of a turn, by the turn's first line. */
  const turnOf = new Map<number, number>();
  /** Each turn's answer, by the turn's first line. */
  const turnAnswerOf = new Map<number, number>();
  {
    let turn: number[] = [];
    const close = () => {
      if (turn.length === 0) return;
      const head = turn[0];
      turnHead.add(head);
      turn.forEach((at) => turnOf.set(at, head));
      const said = turn.filter((at) => messages[at].role !== CALL_ROLE && messages[at].role !== THOUGHT_ROLE);
      if (said.length > 0) turnAnswerOf.set(head, said[said.length - 1]);
      turn = [];
    };
    messages.forEach((message, at) => {
      if (message.role === 'user' || message.compaction != null) {
        close();
        return;
      }
      if (carried.has(at)) return;
      if (message.role === THOUGHT_ROLE && (message.thinking ?? '').trim() === '') return;
      turn.push(at);
    });
    close();
  }
  const isTurnAnswer = (index: number) => {
    const head = turnOf.get(index);
    return head === undefined || turnAnswerOf.get(head) === index;
  };
  /** Who the turn was: whoever gave its answer, or failing that its first line. */
  const turnName = (index: number) => {
    const head = turnOf.get(index) ?? index;
    const answer = turnAnswerOf.get(head);
    return (
      (answer === undefined ? null : messages[answer].actor) ??
      messages[head].actor ??
      current?.agentName ??
      current?.modelName ??
      'assistant'
    );
  };
  /** The one header of a turn whose first line is a call or a thought, drawn above it. */
  const turnHeader = (index: number) => (
    <div className={styles.assistantRow} data-turn-line={index}>
      <span className={styles.assistantAvatar} aria-hidden="true">
        <img src={cpuIcon} alt="" width={16} height={16} />
      </span>
      <div className={styles.assistantBody}>
        <span className={styles.assistantName} data-turn-header="">
          {turnName(index)}
        </span>
        {sentAt(messages[index].at) !== null && <span className={styles.sentAt}>{sentAt(messages[index].at)}</span>}
      </div>
    </div>
  );

  /** Each review where it was sent, and - for one taken back - a line where it was taken back. */
  const placedReviews = new Map<number, { review: ChatReview; taken: boolean }[]>();
  const place = (when: string, entry: { review: ChatReview; taken: boolean }) => {
    const sent = Date.parse(when);
    const before = messages.findIndex((message) => message.at !== null && Date.parse(message.at) > sent);
    const at = before === -1 ? messages.length : before;
    placedReviews.set(at, [...(placedReviews.get(at) ?? []), entry]);
  };
  for (const review of reviews) {
    place(review.at, { review, taken: false });
    if (review.withdrawnAt !== null) place(review.withdrawnAt, { review, taken: true });
  }
  const placedRequests = placeRequests(
    messages,
    (message) => message.at,
    answeredRequests.filter((request) => !turnRequests.includes(request)),
    true,
    false,
  );
  /*
   * A question placed just before an answer was asked during the turn that
   * answer ends - the answer is dated when it lands, after the question - so it
   * is drawn inside that answer, under the agent's name, rather than as a card
   * between the person's message and the agent's reply, where it read as
   * nobody's.
   */
  const requestsInAnswer = new Map<number, typeof answeredRequests>();
  for (const [at, placed] of [...placedRequests]) {
    if (messages[at]?.role !== 'assistant') continue;
    requestsInAnswer.set(at, placed);
    placedRequests.delete(at);
  }
  /*
   * The questions of the turn on screen, each given one place among its calls:
   * before the first call the page heard of after it was asked, or after the
   * last. Decided here once per request rather than by each list of calls as it
   * was drawn, because every answer with kept thinking draws a working section
   * too - its list of calls is empty, and the "after the last" there took every
   * question of the turn running below it, so one question was drawn twice.
   */
  const requestsAtCall = new Map<number, InteractionRequest[]>();
  const requestsAtTurnEnd: InteractionRequest[] = [];
  for (const request of turnRequests) {
    const asked = Date.parse(request.createdAt);
    const call = working.calls.find((one) => one.seenAt !== undefined && asked < one.seenAt);
    if (call === undefined) requestsAtTurnEnd.push(request);
    else requestsAtCall.set(call.at, [...(requestsAtCall.get(call.at) ?? []), request]);
  }
  /** Every file this chat holds, for the viewer's arrows. */
  const chatFiles = messages.flatMap((message) => message.attachments ?? []);
  /**
   * The files under one message: a picture as itself, opening in the viewer,
   * a video or a sound playing where it is, anything else as a chip that
   * downloads. The same drawing the strip above
   * the composer used, which said nothing about which message a file came with.
   */
  const filesOf = (files: Attachment[], side: 'user' | 'assistant') =>
    files.length === 0 ? null : (
      <div className={side === 'user' ? `${styles.messageFiles} ${styles.messageFilesUser}` : styles.messageFiles} data-message-files="">
        {files.map((file) =>
          isShowable(file.contentType) ? (
            <button
              key={file.id}
              type="button"
              className={styles.chatImage}
              onClick={() => setPreviewId(file.id)}
              title={`Open ${file.filename}`}
              data-message-file={file.id}
            >
              <img className={styles.thumb} src={attachmentUrl(file.id)} alt={file.filename} />
            </button>
          ) : isPlayable(file.contentType) ? (
            <video
              key={file.id}
              className={styles.chatVideo}
              src={attachmentUrl(file.id)}
              controls
              preload="metadata"
              title={file.filename}
              data-message-file={file.id}
              data-message-video=""
            />
          ) : isAudible(file.contentType) || isMidi(file.contentType) ? (
            <AttachmentSound key={file.id} file={file} />
          ) : (
            <a
              key={file.id}
              className={styles.chatFile}
              href={attachmentUrl(file.id)}
              download={file.filename}
              title={`Download ${file.filename}`}
              data-message-file={file.id}
            >
              <span className={styles.attachmentName}>{file.filename}</span>
              <span className={styles.attachmentSize}>{formatSize(file.sizeBytes)}</span>
            </a>
          ),
        )}
      </div>
    );
  /** Files a message already shows inline, as a drawn picture does, are not listed under it again. */
  const filesUnder = (message: ChatMessage) =>
    (message.attachments ?? []).filter((file) => !message.content.includes(`/api/attachments/${file.id}`));

  /*
   * Whether this workspace has anything to transcribe with.
   *
   * Asked once, and the microphone is simply absent when the answer is no: a
   * button that fails every time it is pressed is worse than one that is not
   * offered.
   */
  const [hears, setHears] = useState(false);
  /** Whether a speech model is set, which is what puts a speaker under an answer. */
  const [reads, setReads] = useState(false);
  /** Whether the workspace has answered at all, so voice mode is not called unavailable while it is being asked. */
  const [voiceKnown, setVoiceKnown] = useState(false);
  /** Whether the workspace chose to take voice mode off its chat bar. */
  const [voiceHidden, setVoiceHidden] = useState(false);
  /** Whether the "why not" note under a voice button that cannot start is open. */
  const [voiceWhy, setVoiceWhy] = useState(false);
  const voiceWhyClosing = useRef<number | null>(null);
  /** Whether the workspace shows when each message was sent. Issue #323. */
  const [showTimestamps, setShowTimestamps] = useState(false);
  /**
   * How long a pause in the typing asks for a sentence completion, or null
   * where the workspace chose no Completion model and nothing is ever asked.
   * Issue #649.
   */
  const [completionPause, setCompletionPause] = useState<number | null>(null);
  /** The grey copy of the composer the suggestion is drawn in. */
  const ghostRef = useRef<HTMLDivElement>(null);
  /** Whether a chat timer sounds when it ends, where its agent chose nothing: the workspace's setting. */
  const [timerSound, setTimerSound] = useState(true);
  /*
   * Whether this chat is being held out loud.
   *
   * Needs both halves — something to hear with and something to answer with —
   * so it is offered only where the workspace has set both models.
   */
  const [voice, setVoice] = useState(false);
  /*
   * Which of the three things voice mode is doing, so the button can say so.
   *
   * Held here rather than read out of the panel, because the button lives in
   * the title bar and the panel is off to the side: a control that looks the
   * same whether it is listening, thinking or talking is a control that says
   * nothing.
   */
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('listening');
  const voiceControls = useRef<VoiceModeHandle>(null);
  /**
   * What was attached to a message typed while voice mode was open, and which
   * message it was.
   *
   * Handed over in a ref rather than through the panel, because the panel has
   * no business knowing what a file is: it sends a turn and reads the answer,
   * and what goes with that turn is the composer's own affair.
   *
   * The text is kept beside the ids because the turn that eventually carries
   * them may not be the one that was typed — a message held while the panel was
   * busy has whatever was said after it added to it. So the turn that contains
   * this text is the one these belong to, and a turn that does not is somebody
   * else's.
   */
  const voiceFiles = useRef<{ text: string; ids: string[] } | null>(null);
  /**
   * What this workspace has decided about how a turn ends, or nothing.
   *
   * Read here rather than in the panel because this is already the one place
   * that asks the server about the workspace — it is the same request that
   * decides whether voice mode is offered at all — and a panel that fetched
   * again would be asking twice for the same answer, once per time somebody
   * enters voice mode. Null in any of the three is the workspace having decided
   * nothing, and the panel is what knows what that then means.
   */
  const [turnTaking, setTurnTaking] = useState<VoiceTurnTaking | null>(null);
  /**
   * Where this workspace has said an answer may be cut for the speech model.
   *
   * Off the same request as the three above, and it applies to both readers on
   * this page: the speaker under an answer and the voice panel are one setting's
   * business, because they are the same answer being read to the same person.
   * The default until the workspace has answered - which is what it was before
   * this could be said, so nothing sounds different while the fetch is in the
   * air.
   */
  const [chunking, setChunking] = useState<SpeechChunking>(CHUNKING_DEFAULT);

  useEffect(() => {
    if (workspaceId === null) return;
    /*
     * An answer that is no longer wanted is dropped rather than applied.
     *
     * This fills the form from what came back, so a reply landing late writes
     * the stored version over whatever is in the boxes - somebody's typing, or
     * the record they opened after this one. Nothing on screen says it
     * happened: it is the state behind the fields that is replaced, and the
     * state is what the save sends. #324, #862 and #863 were three reports of
     * it on three pages.
     */
    let abandoned = false;
    fetchWorkspace(workspaceId)
      .then((held) => {
        if (abandoned) return;
        setHears(held?.transcriptionModelId != null);
        setReads(held?.speechModelId != null);
        setVoiceHidden(held?.voiceButtonHidden ?? false);
        setVoiceKnown(true);
        setShowTimestamps(held?.chatShowTimestamps ?? true);
        setCompletionPause(held?.completionModelId == null ? null : held.completionPauseMillis);
        setTimerSound(held?.widgetTimerSound ?? true);
        setWorkspaceMarker(held === null ? null : (held.commandMarker ?? held.commandMarkerDefault));
        setChunking(held?.voiceSpeechChunking ?? CHUNKING_DEFAULT);
        setTurnTaking(
          held === null
            ? null
            : {
                pauseEndsTurnMs: held.voicePauseEndsTurnMs,
                speechOverRoomPercent: held.voiceSpeechOverRoomPercent,
                unattendedMicrophoneMs: held.voiceUnattendedMicrophoneMs,
                bargeInMs: held.voiceBargeInMs,
                bargeInWhileThinking: held.voiceBargeInWhileThinking,
              },
        );
      })
      .catch(() => {
        if (abandoned) return;
        setHears(false);
        setReads(false);
        setWorkspaceMarker(null);
        // Nothing rather than a guess: null in all three is exactly "the
        // workspace has decided nothing", which is the panel's own numbers.
        setTurnTaking(null);
        setChunking(CHUNKING_DEFAULT);
      });
    return () => {
      abandoned = true;
    };
  }, [workspaceId]);

  /*
   * Leaving a chat, or the page, stops it talking.
   *
   * An answer read aloud outliving the conversation it belongs to is a voice
   * coming from nothing on screen — and on the way out there is nobody left to
   * press stop.
   */
  useEffect(() => hush, [currentId]);

  useEffect(() => {
    fetchInstallationSettings()
      .then((held) => {
        setAttachmentsAllowed(held.attachmentsEnabled);
        setInstallationMarker(held.commandMarker);
      })
      .catch(() => setAttachmentsAllowed(false));
    fetchSessionReviewsOffered()
      .then(setReviewsOffered)
      .catch(() => setReviewsOffered(false));
    // Run on a shell block: offered only to an administrator, while Admin -> Settings allows it.
    fetchCommandRunsOffered()
      .then(setRunOffer)
      .catch(() => setRunOffer(undefined));
  }, []);

  // Someone on an old link, or with the page still open when it was switched
  // off. Sent to the documentation rather than left on a composer that refuses.
  const installation = useInstallation();
  const chatOff = installation !== null && !installation.chatEnabled;

  // The menu closes the way every other menu here does.
  useEffect(() => {
    if (!addOpen) return;

    function onDown(event: MouseEvent) {
      if (!addRef.current?.contains(event.target as Node)) setAddOpen(false);
    }

    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [addOpen]);

  /*
   * What was said is the server's to answer, so it is asked — but only while
   * the box is ticked, and only after typing stops. Titles stay a filter over
   * what the sidebar already holds, which is why they never wait for anything.
   */
  useEffect(() => {
    const needle = search.trim();
    if (!searchInMessages || needle === '' || workspaceId === null) {
      setMentioning([]);
      return;
    }

    const timer = window.setTimeout(() => {
      fetchChatsMentioning(workspaceId, needle)
        .then(setMentioning)
        // A search that could not be run finds nothing more than the titles do.
        .catch(() => setMentioning([]));
    }, SEARCH_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchInMessages, workspaceId]);

  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = sessions ?? [];
    if (needle === '') return all;

    const said = new Set(mentioning);
    return all.filter((entry) => entry.title.toLowerCase().includes(needle) || said.has(entry.id));
  }, [sessions, search, mentioning]);

  const pinned = matching.filter((entry) => entry.pinned);
  const recent = matching.filter((entry) => !entry.pinned);

  const pickerEntries = useMemo(() => {
    const needle = pickerSearch.trim().toLowerCase();
    // An agent with no model chosen cannot answer, so it is offered switched
    // off rather than left out: somebody looking for it should find it and be
    // told why it will not do, not wonder where it went.
    const entries = agents.map((agent) => ({
      id: agent.id,
      label: agent.name,
      enabled: agent.enabled && agent.modelId !== null,
    }));
    return needle === '' ? entries : entries.filter((entry) => entry.label.toLowerCase().includes(needle));
  }, [agents, pickerSearch]);

  async function guard(work: () => Promise<void>) {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('That did not work.'));
    }
  }

  async function handleNew() {
    // Saying why beats a button that looks like it did nothing.
    if (workspaceId === null) {
      setError(t('There is no workspace to chat in yet.'));
      return;
    }
    await guard(async () => {
      const created = await startChat(workspaceId, t('New chat'));
      await loadSessions(created.id);
    });
  }


  /**
   * Whether there is anything here to chat to.
   *
   * A workspace with no usable agent is a workspace where a chat cannot be
   * started, which is a state this page did not have before issue #295: a bare
   * model used to be there whatever else was, so a workspace with a model could
   * always hold a conversation. The server refuses it now, and the button is
   * stopped short of that refusal so nobody presses it to find out.
   *
   * True only where the list actually arrived and had nothing usable in it.
   * Every other way of holding no agents is a different thing: not asked for
   * yet, still being asked for, or asked for and refused. An empty list now
   * carries "add one" behind it, so reading a server that has gone away as an
   * empty workspace would send somebody off to build an agent they already have,
   * and would take the button away while they did.
   */
  const noAgents =
    counted &&
    agentCatalogue.failure === null &&
    !agents.some((one) => one.enabled && one.modelId !== null);

  /** The workspaces this visit has already started a chat in by itself, so a failed start is not tried again. */
  const autoStarted = useRef(new Set<string>());
  /** Set by a chat started that way: its composer is focused once the chat it belongs to has drawn it. */
  const focusWhenOpen = useRef(false);

  /*
   * Nobody with no chats is shown "No chat open".
   *
   * A fresh installation's first visit to Chat was an empty page and a button
   * to press before anything could be typed. With nothing to choose between,
   * the page presses it: the same "+ New", once per workspace per visit, and
   * the composer is focused in the chat it makes.
   *
   * Only on a list that arrived and is truly empty - not while it loads, not
   * when a search is what emptied it (`sessions` is the whole list; the search
   * filters a copy), not when it failed - and not where the address names a
   * chat. Not where there is no agent to chat with either: "+ New" is switched
   * off there and the page says why, so this stands aside the same way.
   *
   * No pile of empty chats can come of it: it acts only on a workspace with
   * none, and the one it makes is a chat in the list from then on.
   */
  useEffect(() => {
    if (workspaceId === null || chatId !== null || sessions === null || sessions.length > 0) return;
    if (agentCatalogue.loading || agentCatalogue.failure !== null || noAgents) return;
    if (!agents.some((one) => one.enabled && one.modelId !== null)) return;
    if (autoStarted.current.has(workspaceId)) return;
    autoStarted.current.add(workspaceId);
    focusWhenOpen.current = true;
    void handleNew();
    // handleNew reads the same state this lists; naming it would restart the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, chatId, sessions, agentCatalogue.loading, agentCatalogue.failure, noAgents, agents]);

  useEffect(() => {
    if (!focusWhenOpen.current || composerRef.current === null || composerRef.current.disabled) return;
    focusWhenOpen.current = false;
    composerRef.current.focus();
  });

  /**
   * Closes the composer's microphone, wherever the closing came from.
   *
   * The one place it is given back — pressing stop, a recording that ended by
   * itself, or this page going away underneath it. The light on the machine
   * goes out when the tracks do, not when the recorder stops and not when the
   * last reference is dropped, so both happen here rather than in each caller.
   *
   * Safe to call twice, and safe to call when nothing is open.
   */
  const releaseMicrophone = useCallback(() => {
    const held = recorder.current;
    recorder.current = null;
    if (held !== null && held.state !== 'inactive') held.stop();
    microphone.current?.getTracks().forEach((track) => track.stop());
    microphone.current = null;
    setRecording(false);
    setListening(null);
  }, []);

  /*
   * Leaving the page closes the microphone.
   *
   * Stopping is a button somebody presses, and somebody who walks away
   * mid-sentence never presses it: without this the device stays open, with the
   * browser saying so, until the page is reloaded.
   */
  useEffect(() => {
    leaving.current = false;
    return () => {
      leaving.current = true;
      releaseMicrophone();
    };
  }, [releaseMicrophone]);

  /**
   * Starts recording, or stops and sends what was said to be transcribed.
   *
   * The transcript is put into the box rather than sent: speech is how the
   * message was typed, not a decision to send it, and anything misheard is
   * fixed before anybody else sees it.
   */
  async function handleMicrophone() {
    if (recording) {
      // The same closing as every other way out, so the transcript still
      // arrives — stopping the recorder is what produces it.
      releaseMicrophone();
      return;
    }
    if (workspaceId === null) return;

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const held = new MediaRecorder(stream);
      const pieces: Blob[] = [];

      held.ondataavailable = (event) => {
        if (event.data.size > 0) pieces.push(event.data);
      };
      held.onstop = () => {
        releaseMicrophone();
        // Stopped on the way out rather than by anybody pressing anything:
        // there is no box left to put a transcript in.
        if (leaving.current) return;

        const said = new Blob(pieces, { type: held.mimeType });
        if (said.size === 0) return;

        setTranscribing(true);
        transcribe(workspaceId, said)
          .then((text) => {
            if (text.trim() === '') return;
            // Appended, so speaking twice adds to what is there rather than
            // replacing it, and so does speaking after typing.
            setDraft((current) => (current.trim() === '' ? text : `${current.trim()} ${text}`));
          })
          .catch((cause: unknown) =>
            setError(cause instanceof Error ? cause.message : t('That could not be transcribed.')),
          )
          .finally(() => setTranscribing(false));
      };

      recorder.current = held;
      microphone.current = stream;
      setRecording(true);
      setListening(stream);
      held.start();
    } catch {
      setError(t('The microphone could not be opened. The browser may have refused it.'));
    }
  }

  /**
   * Uploads what was picked and keeps it beside the message being written.
   *
   * Uploaded now rather than on send, so a large file is on its way while the
   * sentence is still being typed — and so a failure is a chip that did not
   * appear rather than a message that would not go.
   */
  async function handleFiles(files: FileList | File[] | null) {
    if (files === null || files.length === 0 || workspaceId === null) return;

    setAttaching(true);
    setError(null);
    try {
      const held = await uploadAttachments(workspaceId, Array.from(files));
      setAttached((current) => [...current, ...held]);
      // What comes after a file is what to say about it: the caret goes to the end of the box.
      const box = composerRef.current;
      if (box !== null && !box.disabled) {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Those files could not be uploaded.'));
    } finally {
      setAttaching(false);
      // Cleared so the same file can be picked twice in a row.
      if (filesRef.current !== null) filesRef.current.value = '';
    }
  }

  /**
   * Stops whatever is being read, and lets go of it.
   *
   * Everything a reading is holding — the pieces not asked for yet, the request
   * in the air, the clip playing and the object URL under it — is the reading's
   * own, so stopping it is one call rather than a list somebody has to keep in
   * step.
   */
  function hush() {
    reading.current?.stop();
    reading.current = null;
    setSpeaking(null);
    setFetchingSpeech(null);
    setSpeechHeard(null);
  }

  /**
   * Reads one answer aloud, or stops it if it is the one already talking.
   *
   * In pieces, and the first of them is asked for on its own: an answer of any
   * length used to be one request, so the wait before the first word was the
   * wait for the last one to be synthesised — seconds of a button that had
   * plainly been pressed and a page saying nothing. Where the pieces end is the
   * workspace's, and one of the three it can say is that old single request.
   *
   * What is read is what the answer renders to and not the markdown it is
   * written in, which is `readAloud`'s doing and every reader's alike.
   */
  function readAnswer(index: number, text: string) {
    if (workspaceId === null) return;

    // A second press on the one that is talking — or being fetched — is "stop".
    const stopping = speaking === index || fetchingSpeech === index;
    hush();
    if (stopping) return;

    setError(null);
    setFetchingSpeech(index);
    const say = readAloud(
      workspaceId,
      {
        // Speaking when there is sound, not when there is a request.
        onStart: () => {
          if (reading.current !== say) return;
          setFetchingSpeech(null);
          setSpeaking(index);
        },
        onEnd: () => {
          if (reading.current === say) hush();
        },
        onProgress: (heard) => {
          if (reading.current === say) setSpeechHeard(heard);
        },
        onFailure: (reason) => {
          if (reading.current !== say) return;
          hush();
          setError(reason);
        },
      },
      chunking,
    );
    reading.current = say;
    say.push(text, true);
  }

  /**
   * One turn held in voice mode: what was said - or typed - goes to the model,
   * and the answer comes back as text for the panel to read aloud.
   *
   * The same stream as the composer's, so a conversation held by voice lands in
   * the transcript exactly as a typed one does — same chat, same history, and
   * the answer grows on screen while it is still being spoken.
   *
   * `sending` is set here for the same reason it is set on a typed send: it is
   * what draws *Waiting for Gemma…* under the turn. The panel had that state to
   * itself, off to the side, so a conversation held by voice showed the
   * question, then nothing at all, then a whole answer — and the one screen
   * saying the model was working was the one nobody was looking at.
   */
  async function handleVoiceTurn(
    text: string,
    onProgress: (soFar: string, settled?: boolean) => void,
    signal: AbortSignal,
  ): Promise<string> {
    if (currentId === null) return '';
    // The agent's words between its calls are read as they come, then the answer. Issue #671.
    const voiced = voicedTurn(onProgress);

    // What the composer had attached when this was typed, if it was typed and
    // if this is the turn that ended up carrying it.
    const held = voiceFiles.current;
    const carries = held !== null && text.includes(held.text);
    const going = carries ? held.ids : [];
    if (carries) voiceFiles.current = null;

    setMessages((present) => [
      ...present,
      { role: 'user', content: text, actor: null, takes: [], thinking: null, thinkingMillis: null, at: new Date().toISOString() },
      { role: 'assistant', content: '', actor: null, takes: [], thinking: null, thinkingMillis: null, at: null },
    ]);
    setError(null);
    setWorking(NOTHING_YET);
    thinkingSoFar.current = '';
    setSending(true);

    let answer = '';
    let failure: string | null = null;
    /*
     * The panel owns a spoken turn and therefore owns the stopping of it, so
     * the signal it hands down is the one that goes to the server rather than a
     * second one made here. What the composer's own Stop is for is the turn it
     * started itself; in voice mode the composer draws no Stop, because the
     * circle beside it is that control and two of them would be two ways to
     * cut in that disagreed about what a turn is.
     */
    try {
      const heard = await streamChatMessage(
        currentId,
        text,
        {
          onChunk: (piece) => {
            answer += piece;
            setMessages((present) => {
              const grown = [...present];
              const last = grown.length - 1;
              grown[last] = { ...grown[last], content: grown[last].content + piece };
              return grown;
            });
            // The panel reads whole sentences out of this while the rest is
            // still being written, so it is handed the answer so far rather
            // than the piece: what it needs to know is how much of it it has
            // already read.
            voiced.answered(answer);
          },
          ...watchWorking(voiced),
          // A sound the agent plays goes into the panel's speaker queue, ahead of the answer it reads.
          onPlay: (sound) => voiceControls.current?.play(sound.url),
          onDone: (spend) => keepThinkingOnAnswer(spend),
          onError: (reason) => {
            failure = reason;
          },
        },
        going,
        signal,
        // A voice turn is spoken and gone: leaving it stops it, the way #299
        // meant voice mode to work. The composer's text turns leave this false.
        true,
      );
      if (failure !== null) throw new Error(failure);
      // The turn ended out of sight: what the server kept is the answer.
      if (!heard) await fetchChatMessages(currentId).then(setMessages).catch(() => undefined);
      drewPicture.current = false;
      await loadSessions(currentId);
    } finally {
      setSending(false);
    }
    return voiced.text();
  }

  /**
   * The three handlers that follow a turn's working, written once.
   *
   * All three doors into the model — a typed send, a spoken one, and asking for
   * the answer again — want exactly this and want it identically. Three copies
   * would be three places for a call to stop being paired with its result, and
   * the symptom of that is a lookup that says it is running for ever.
   *
   * A call arrives before its tool has run and is drawn straight away with a
   * null result, which `CallLine` shows as running; the result lands on it by
   * `at`. Matched rather than appended blind, because a round may make several
   * calls and nothing promises the first one to answer is the first one made.
   *
   * `voiced` is a voice turn's reading, which hears what the agent says
   * between its calls as well as drawing it.
   */
  function watchWorking(voiced?: VoicedTurn): Pick<
    ChatStreamHandlers,
    'onThinking' | 'onThought' | 'onDrew' | 'onFiled' | 'onWidgets' | 'onSaid' | 'onPersonRead' | 'onSession' | 'onTitleFailed' | 'onTitling' | 'onTitlingAbandoned' | 'onTitled' | 'onWriting' | 'onCall' | 'onCalled' | 'onCompacting' | 'onCompacted'
  > {
    return {
      onThinking: (piece) => {
        // Mirrored into a ref as well as into state, because `onDone` has to
        // read the whole of it to put it on the message and cannot see a state
        // update made in the same run of handlers.
        thinkingSoFar.current += piece;
        // Thinking means the prompt has been read: a "Reading the prompt…" card left up said otherwise.
        setWorking((held) => {
          const last = held.calls[held.calls.length - 1];
          const calls =
            held.calls.length === 0
              ? held.calls
              : last?.thought !== undefined
                ? [...held.calls.slice(0, -1), { ...last, thought: last.thought + piece }]
                : [
                    ...held.calls,
                    { at: -1 - held.calls.length, tool: '', arguments: '', result: '', failed: false, thought: piece, seenAt: Date.now() },
                  ];
          return {
            ...held,
            thinking: held.thinking + piece,
            opening: held.calls.length === 0 ? held.opening + piece : held.opening,
            calls,
            writing: held.writing?.promptTotal != null ? null : held.writing,
          };
        });
      },
      /*
       * A drawn picture is put in front of the answer being written, because
       * that is where the server put it: the thread holds an assistant turn
       * with the markdown, written the moment the picture was drawn. Inserted
       * before the message still being streamed so that a reload shows the same
       * order it was shown in live - the picture, then what the model said
       * about it.
       */
      onDrew: (markdown) => {
        drewPicture.current = true;
        /*
         * And a line among the calls, where the picture is drawn while the
         * working is on screen. Carried below the working instead, a picture
         * drawn before the person wrote into the turn was drawn under what
         * they wrote - chat 974's mockup read as the answer to "ok, but I
         * want wireframe", which it came before.
         */
        setWorking((held) => ({
          ...held,
          calls: [
            ...held.calls,
            { at: -1 - held.calls.length, tool: '', arguments: '', result: '', failed: false, drew: markdown, seenAt: Date.now() },
          ],
        }));
        setMessages((present) => {
          const at = present.length - 1;
          const drawn = {
            role: 'assistant' as const,
            content: markdown,
            actor: null,
            takes: [],
            thinking: null,
            thinkingMillis: null,
            // A drawn image is a fresh line; its time, if shown, arrives with
            // the reload that reads it back from the store.
            at: null,
          };
          if (at < 0) return [...present, drawn];
          return [...present.slice(0, at), drawn, present[at]];
        });
      },
      /*
       * A round's thinking is over, with how long it took. Put on the line the
       * pieces were drawn into - the opening, or the round's line among the
       * calls - or, for a round whose pieces never arrived, a line of its own.
       * Before this a line carried the page's own count, which read "0.0
       * seconds" for thinking that arrived at once and nothing for a line that
       * was never the last one while it grew; and the opening carried the whole
       * turn's total, which read as that one round taking all of it.
       */
      onThought: (text, millis) =>
        setWorking((held) => {
          if (held.calls.length === 0) {
            return { ...held, opening: held.opening.trim() === '' ? text : held.opening, openingMillis: millis };
          }
          const last = held.calls[held.calls.length - 1];
          if (last.thought !== undefined) {
            const settled = { ...last, thought: last.thought.trim() === '' ? text : last.thought, thoughtMillis: millis };
            return { ...held, calls: [...held.calls.slice(0, -1), settled] };
          }
          return {
            ...held,
            calls: [
              ...held.calls,
              { at: -1 - held.calls.length, tool: '', arguments: '', result: '', failed: false, thought: text, thoughtMillis: millis, seenAt: Date.now() },
            ],
          };
        }),
      onCompacting: () => setWorking((held) => ({ ...held, compacting: true })),
      /*
       * The summary is in the thread now and the messages it replaced are gone,
       * so this is said where the conversation is rather than beside the answer:
       * a line in the transcript, at the point the older turns used to be.
       */
      onCompacted: (held: { replaced: number; kept: number; tokens: number; summary: string }) => {
        setWorking((present) => ({ ...present, compacting: false }));
        setMessages((present) => {
          const at = present.length - 1;
          const note = {
            role: 'assistant' as const,
            content:
              held.replaced === 1
                ? 'One earlier message was summarised to keep this chat inside its model’s window.'
                : `${held.replaced} earlier messages were summarised to keep this chat inside its ` +
                  `model’s window. The last ${held.kept} are unchanged.`,
            actor: null,
            takes: [],
            thinking: null,
            thinkingMillis: null,
            at: null,
            // Carries the summary so the note can reveal it, collapsed by
            // default. Empty when an older server sent no summary text.
            compaction: held.summary === '' ? null : { replaced: held.replaced, summary: held.summary },
          };
          if (at < 0) return [...present, note];
          return [...present.slice(0, at), note, present[at]];
        });
      },
      /*
       * In the same list as the calls, so it reads where it was said: before the
       * lookups it introduced. Keyed below zero, where no call's `at` can be.
       */
      /* Said for a moment and gone: naming failing is worth knowing, not worth a line in the chat. */
      onTitleFailed: (reason) => {
        setNaming(null);
        setPassing(tf('Could not name this chat: {reason}', { reason }));
        window.setTimeout(() => setPassing(null), PASSING_MS);
      },
      /* Naming takes a moment after the answer, and the bar said nothing while it did. */
      onTitling: () => setNaming(openChat.current),
      onTitlingAbandoned: () => setNaming(null),
      /* The name, as soon as it is known - on the bar and in the list, not at the next reload of either. */
      onTitled: (title) => {
        const chat = openChat.current;
        setNaming(null);
        if (chat === null) return;
        setSessions((held) => held?.map((entry) => (entry.id === chat ? { ...entry, title } : entry)) ?? held);
      },
      /* The chat's session exists from its first turn's start: the header's link to it shows then, not after a reload. */
      onSession: (id) => {
        const chat = openChat.current;
        if (chat === null) return;
        setSessions((held) => held?.map((entry) => (entry.id === chat && entry.llmSessionId !== id ? { ...entry, llmSessionId: id } : entry)) ?? held);
      },
      /* The oldest of the person's waiting lines with these words is the one the agent just read. */
      /*
       * Drawn where the agent read it, not where it was typed: the calls made
       * in between were made without it, and the line sat above them as though
       * the agent had ignored it. So it moves to the end of what the turn has
       * done so far, stamped with now.
       *
       * And on a page that came back to a running turn, the thread already
       * held it - the server files a read message into the history at once - so
       * it was drawn as a bubble above the whole turn. The replayed frame puts
       * it in the turn instead, and the bubble goes.
       */
      onPersonRead: (text) => {
        const now = Date.now();
        setWorking((held) => {
          const at = held.calls.findIndex((call) => call.person === text && call.personRead !== true);
          const line =
            at >= 0
              ? { ...held.calls[at], personRead: true, seenAt: now }
              : { at: -now - held.calls.length, tool: '', arguments: '', result: '', failed: false, person: text, personRead: true, seenAt: now };
          return { ...held, calls: [...held.calls.filter((_, index) => index !== at), line] };
        });
        setMessages((present) => {
          let answered = -1;
          present.forEach((message, index) => {
            if (message.role === 'assistant' && message.content !== '') answered = index;
          });
          // After the last answer, the first person's message opened this turn; what came after it was read in it.
          const asked = present.map((message, index) => ({ message, index })).filter(({ message, index }) => index > answered && message.role === 'user');
          const drawnAbove = asked.slice(1).find(({ message }) => message.content === text);
          return drawnAbove === undefined ? present : present.filter((_, index) => index !== drawnAbove.index);
        });
      },
      onSaid: (text) => {
        voiced?.said(text);
        setWorking((held) => ({
          ...held,
          calls: [
            ...held.calls,
            { at: -1 - held.calls.length, tool: '', arguments: '', result: '', failed: false, said: text, seenAt: Date.now() },
          ],
        }));
      },
      onWriting: (writing) => setWorking((held) => ({ ...held, writing })),
      // The call it was writing has arrived, so the line saying so goes.
      onCall: (call) =>
        setWorking((held) => ({
          ...held,
          writing: null,
          calls: [...held.calls, { ...call, result: null, failed: false, seenAt: Date.now() }],
        })),
      /*
       * A file the agent's side filed during the turn belongs to the answer the
       * turn ends, which is the message still being written - the last one.
       */
      /* The agent changed a widget: the whole row as it now stands. */
      onWidgets: (now) => setWidgets(now),
      onFiled: (file) =>
        setMessages((present) => {
          const at = present.length - 1;
          if (at < 0 || present[at].role !== 'assistant') return present;
          const last = present[at];
          if ((last.attachments ?? []).some((held) => held.id === file.id)) return present;
          // A picture drawn into the thread is already on the screen as its own line; listed under the answer too, it showed twice.
          if (present.some((one) => one.content.includes(`/api/attachments/${file.id})`))) return present;
          return [...present.slice(0, at), { ...last, attachments: [...(last.attachments ?? []), file] }];
        }),
      onCalled: (answer) =>
        setWorking((held) => ({
          ...held,
          calls: held.calls.map((call) =>
            call.at === answer.at ? { ...call, result: answer.result, failed: answer.failed, link: answer.link } : call,
          ),
        })),
    };
  }

  /**
   * The turn is over: what it cost goes on the screen, and what it thought goes
   * on the message.
   *
   * Written onto the message rather than left in `working` so that the answer
   * just given and an answer read back off the server are drawn from the same
   * field. Otherwise the block would sit there live and then vanish on the next
   * reload, which is the bug this whole change is about.
   */
  function keepThinkingOnAnswer(spend: ChatSpend) {
    setLastSpend(spend);
    /*
     * The answer is dated when it is finished, as the store dates it. Left
     * without a time it could not be placed against anything asked while it was
     * being written, and a question the agent put mid-turn sank below it.
     */
    setMessages((present) => {
      const last = present.length - 1;
      if (last < 0 || present[last].role !== 'assistant') return present;
      const grown = [...present];
      grown[last] = { ...grown[last], spend, at: grown[last].at ?? new Date().toISOString() };
      return grown;
    });
    const thought = thinkingSoFar.current;
    if (thought.trim() === '') return;
    setMessages((present) => {
      const grown = [...present];
      const last = grown.length - 1;
      if (last < 0) return present;
      grown[last] = {
        ...grown[last],
        thinking: thought,
        thinkingMillis: spend.thinkingMillis && spend.thinkingMillis > 0 ? spend.thinkingMillis : null,
      };
      return grown;
    });
  }

  /**
   * Runs what was typed, where what was typed is a command.
   *
   * Both halves of the line go into the conversation: what was asked for and
   * what came of it. A command that acted and left no trace would be a run
   * nobody can point at afterwards, and the conversation is where somebody
   * would look - they typed it there.
   */
  async function runCommand(line: string): Promise<boolean> {
    const said = line.trim();
    if (!said.startsWith('/') || workspaceId === null) return false;

    const [head, ...rest] = said.slice(1).split(' ');
    if (!commands.some((one) => one.name.toLowerCase() === head.toLowerCase())) return false;

    setDraft('');
    setCommandAt(-1);
    setMessages((present) => [
      ...present,
      { role: 'user', content: said, actor: null, takes: [], thinking: null, thinkingMillis: null, at: new Date().toISOString() },
    ]);

    const answer = await runChatCommand(workspaceId, head, rest.join(' ').trim() || null).catch(
      (cause: unknown) => (cause instanceof Error ? cause.message : t('The command could not be run.')),
    );
    setMessages((present) => [
      ...present,
      { role: 'assistant', content: answer, actor: null, takes: [], thinking: null, thinkingMillis: null, at: new Date().toISOString() },
    ]);
    return true;
  }

  /**
   * Sends what is in the composer, or [chosen] in its place - a suggested reply
   * clicked under the answer, which is only offered while the composer is
   * empty, so nothing typed is ever replaced by it.
   */
  async function handleSend(event: FormEvent, chosen?: string) {
    event.preventDefault();
    const typed = chosen ?? draft;
    // Words or a file: a picture sent on its own is a message.
    if (currentId === null || (typed.trim() === '' && attached.length === 0)) return;

    // A command is carried out rather than said to the model: the model has no
    // way to run a workflow, and asking it to would be asking it to answer as
    // though it had.
    if (typed.trim() !== '' && (await runCommand(typed))) return;

    /*
     * What was attached is named in the message.
     *
     * The model cannot open a file yet — that is the next piece of this — but a
     * conversation that mentions "the log I attached" and shows nothing is worse
     * than one that lists what came with it.
     */
    const going = attached;
    /*
     * What was attached goes with the message rather than into it.
     *
     * Pictures are handed to the model as part of the turn — it can look at
     * them — so naming them in the text would only be describing what it can
     * already see. Anything it cannot open is still named, since otherwise the
     * conversation refers to a file that was never mentioned.
     */
    const unopenable = going.filter((file) => !file.contentType.startsWith('image/'));
    const named = `Attached: ${unopenable.map((file) => file.filename).join(', ')}`;
    const said = unopenable.length === 0 ? typed.trim() : typed.trim() === '' ? named : `${typed.trim()}

${named}`;

    /*
     * In voice mode the panel owns the turn, whichever way the message was
     * written.
     *
     * Not a second sender beside it: the panel is listening, reading the answer
     * back and deciding when the next turn may start, and a send that went
     * round it would put two turns on one chat, leave the answer unread, and
     * have the microphone still waiting for a turn that had already been taken.
     * So this hands it over — including anything attached, which the turn
     * carries exactly as a typed send does — and what happens to it there is
     * the same as for anything said out loud: this turn if there is none in
     * flight, and the one waiting if there is.
     */
    if (voice && voiceControls.current !== null) {
      setDraft('');
      setAttached([]);
      setError(null);
      if (going.length > 0) voiceFiles.current = { text: said, ids: going.map((file) => file.id) };
      voiceControls.current.say(said);
      return;
    }

    /*
     * Said while the agent is working: not a second turn, but a message the
     * turn reads at its next round, so the agent can change course without being
     * stopped. Drawn at once among what the turn is doing, where it was said. A
     * chat with no agent answers in one call and has no round to read it in, so
     * there it waits as before.
     */
    if (sending && current?.agentId != null) {
      const text = said;
      setDraft('');
      setAttached([]);
      setError(null);
      wroteDuringTurn.current = true;
      setWorking((held) => ({
        ...held,
        calls: [
          ...held.calls,
          { at: -1 - held.calls.length, tool: '', arguments: '', result: '', failed: false, person: text, seenAt: Date.now() },
        ],
      }));
      const taken = await postChatMessageDuringTurn(currentId, text).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : t('Could not send that.'));
        return null;
      });
      // The turn ended before it arrived: it goes as a turn of its own, once this one is put away.
      if (taken === false) sendAfterTurn.current = text;
      return;
    }
    if (sending) return;
    setSending(true);
    setDraft('');
    setAttached([]);
    // Shown straight away: the server has it, and waiting for the model to
    // finish before drawing what was typed reads as a dropped message.
    setMessages((present) => [
      ...present,
      // Drawn under the message at once: the files went with it, and the page knows which.
      { role: 'user', content: said, actor: null, takes: [], thinking: null, thinkingMillis: null, at: new Date().toISOString(), attachments: going },
    ]);
    setError(null);
    // The last answer's working, cleared as this one starts. It stayed on
    // screen after that answer landed on purpose; it belongs to that answer,
    // and one turn further up the log there is nowhere to draw it.
    setWorking(NOTHING_YET);
    thinkingSoFar.current = '';
    // The answer grows in place as it arrives, so the empty assistant turn is
    // appended first and each piece lands on the end of it.
    setMessages((present) => [...present, { role: 'assistant', content: '', actor: null, takes: [], thinking: null, thinkingMillis: null, at: null }]);
    const asked = new AbortController();
    asking.current = asked;
    const sentTo = currentId;
    try {
      let failure: string | null = null;
      const heard = await streamChatMessage(
        currentId,
        said,
        {
          onChunk: (piece) =>
            setMessages((present) => {
              const grown = [...present];
              const last = grown.length - 1;
              grown[last] = { ...grown[last], content: grown[last].content + piece };
              return grown;
            }),
          ...watchWorking(),
          onDone: (spend) => keepThinkingOnAnswer(spend),
          onError: (reason) => {
            failure = reason;
          },
        },
        going.map((file) => file.id),
        asked.signal,
      );
      if (failure !== null) throw new Error(failure);
      // The stream ended and the turn could not be followed to its end, so the
      // history is the only place that holds how it ended.
      if (!heard && openChat.current === sentTo) fetchChatMessages(sentTo).then(setMessages).catch(() => undefined);
      drewPicture.current = false;
      await loadSessions(currentId);
    } catch (cause) {
      // Stopped on purpose is not a failure and is not reported as one. What is
      // still read back is the history, because the server keeps nothing of an
      // answer it was told to abandon - so the half sentence on screen is not
      // what this chat says, and leaving it there would be the screen inventing
      // a turn.
      if (openChat.current !== sentTo) return;
      if (!givenUp(cause)) setError(cause instanceof Error ? cause.message : t('The model did not answer.'));
      // What the server kept is the truth about what was said.
      fetchChatMessages(sentTo).then(setMessages).catch(() => undefined);
    } finally {
      if (asking.current === asked) asking.current = null;
      // A chat left part way has already let this go, and the one open now
      // may be following a turn of its own.
      if (openChat.current === sentTo) setSending(false);
    }
  }

  /**
   * Asks for the last answer again.
   *
   * The one it replaces is not lost: it is put where every earlier take of an
   * answer goes — into the row's own history, one press from being read again —
   * and it is put there here, before anything is asked, so the log never stops
   * holding it even while the new one is being written.
   *
   * Whatever the picker says answers this chat is what answers, which is the
   * model or agent that gave the answer in the first place unless somebody has
   * moved it since. That is why there is no second control for "again, but on
   * something else": the control for that is the one naming who is answering.
   */
  async function handleRegenerate() {
    if (currentId === null || sending) return;
    const at = messages.length - 1;
    // A chat ending on the person's own message - its turn died or was stopped - is answered as it stands.
    const unanswered = messages[at]?.role === 'user';
    if (messages[at]?.role !== 'assistant' && !unanswered) return;

    /*
     * In voice mode the panel owns the turn, and asking again is a turn.
     *
     * Handed over for the reason a typed send is — see `handleSend` — and with
     * the consequence that matters here: the second answer is read aloud. It
     * was not, because nothing in the panel had been told a turn was happening,
     * so a conversation being held out loud went silent at exactly the press
     * that says the last answer was not good enough. Issue #314. The same for
     * a question left unanswered: *answer this* is a turn too, and going round
     * the panel left it on Listening while an answer nobody heard was written.
     */
    if (voice && voiceControls.current !== null) {
      setError(null);
      voiceControls.current.again();
      return;
    }

    setSending(true);
    setError(null);
    if (unanswered) {
      // Nothing to keep as a take: an empty answer under the question, filled as it streams.
      setWorking(NOTHING_YET);
      thinkingSoFar.current = '';
      setMessages((present) => [...present, { role: 'assistant', content: '', actor: null, takes: [], thinking: null, thinkingMillis: null, at: null }]);
    } else {
      anotherTake(at);
    }

    const asked = new AbortController();
    asking.current = asked;
    const sentTo = currentId;
    try {
      let failure: string | null = null;
      const heard = await regenerateChatAnswer(currentId, {
        onChunk: (piece) =>
          setMessages((present) => {
            const grown = [...present];
            const last = grown.length - 1;
            grown[last] = { ...grown[last], content: grown[last].content + piece };
            return grown;
          }),
        ...watchWorking(),
        onDone: (spend) => keepThinkingOnAnswer(spend),
        onError: (reason) => {
          failure = reason;
        },
      }, asked.signal);
      if (failure !== null) throw new Error(failure);
      if (!heard && openChat.current === sentTo) fetchChatMessages(sentTo).then(setMessages).catch(() => undefined);
      await loadSessions(currentId);
    } catch (cause) {
      if (openChat.current !== sentTo) return;
      if (!givenUp(cause)) setError(cause instanceof Error ? cause.message : t('The model did not answer.'));
      // The server puts the answer back when it could not give another, so what
      // it holds is the truth about what this chat says.
      fetchChatMessages(sentTo).then(setMessages).catch(() => undefined);
    } finally {
      if (asking.current === asked) asking.current = null;
      if (openChat.current === sentTo) setSending(false);
    }
  }

  /**
   * Makes room on the last row for the take about to be written.
   *
   * The answer being replaced is not lost: it goes where every earlier take of
   * an answer goes — into the row's own history, one press from being read
   * again — and it goes there before anything is asked, so the log never stops
   * holding it even while the new one is being written. The row is put back to
   * showing the newest take, because the newest is the one being written now.
   *
   * Written once because both doors into a second take want exactly this: the
   * button under the answer, and the same button pressed with the voice panel
   * open. Two copies would be two places for the history to stop being kept.
   */
  function anotherTake(at: number) {
    setLastSpend(null);
    // A second answer does its own thinking and its own lookups, and the first
    // one's would read as this one's.
    setWorking(NOTHING_YET);
    thinkingSoFar.current = '';
    setMessages((present) => {
      const grown = [...present];
      const last = grown.length - 1;
      grown[last] = { ...grown[last], content: '', takes: [...grown[last].takes, grown[last].content] };
      return grown;
    });
    setTakeAt((held) => {
      const { [at]: _dropped, ...rest } = held;
      return rest;
    });
  }

  /**
   * Asking for the last answer again, with the voice panel driving it.
   *
   * The mirror of `handleVoiceTurn` for the one turn that sends nothing, and it
   * is a separate door for the same reason that one is: the panel owns when a
   * turn starts, when it may be cut short and when the next may begin, and it
   * needs the finished answer back to read the tail of it aloud.
   *
   * A failure is thrown rather than shown here. The panel is what is on screen
   * during a spoken turn, and it draws the fault and goes back to listening —
   * an error written under the composer instead would be a red line on the half
   * nobody is looking at.
   */
  async function handleVoiceAgain(
    onProgress: (soFar: string, settled?: boolean) => void,
    signal: AbortSignal,
  ): Promise<string> {
    if (currentId === null) return '';
    const voiced = voicedTurn(onProgress);
    const at = messages.length - 1;
    const unanswered = messages[at]?.role === 'user';
    if (messages[at]?.role !== 'assistant' && !unanswered) return '';

    setError(null);
    setSending(true);
    if (unanswered) {
      // Nothing to keep as a take: an empty answer under the question, filled as it streams.
      setWorking(NOTHING_YET);
      thinkingSoFar.current = '';
      setMessages((present) => [...present, { role: 'assistant', content: '', actor: null, takes: [], thinking: null, thinkingMillis: null, at: null }]);
    } else {
      anotherTake(at);
    }

    let answer = '';
    let failure: string | null = null;
    try {
      const heard = await regenerateChatAnswer(currentId, {
        onChunk: (piece) => {
          answer += piece;
          setMessages((present) => {
            const grown = [...present];
            const last = grown.length - 1;
            grown[last] = { ...grown[last], content: grown[last].content + piece };
            return grown;
          });
          // How much of the answer there is, not the piece: what the panel has
          // to work out is how much of it it has already read.
          voiced.answered(answer);
        },
        ...watchWorking(voiced),
        onPlay: (sound) => voiceControls.current?.play(sound.url),
        onDone: (spend) => keepThinkingOnAnswer(spend),
        onError: (reason) => {
          failure = reason;
        },
        // A voice turn, as its comment in the API says: the server lends audio_play only to one.
      }, signal, true);
      if (failure !== null) throw new Error(failure);
      if (!heard) await fetchChatMessages(currentId).then(setMessages).catch(() => undefined);
      await loadSessions(currentId);
    } catch (cause) {
      /*
       * The server puts the answer back when it could not give another, so what
       * it holds is the truth about what this chat says.
       *
       * Not on a turn somebody cut short, though. Cutting in is how the next
       * turn starts, so by the time a re-read of the log came back it would be
       * the log as it was one turn ago — written over the answer already being
       * spoken.
       */
      if (!signal.aborted) fetchChatMessages(currentId).then(setMessages).catch(() => undefined);
      throw cause;
    } finally {
      /*
       * Same reason as above. A second take is cut short *by* the next turn
       * starting - that is what the button does - and the turn now running has
       * already said it is sending. Clearing it here would clear that, and the
       * *Waiting for Gemma…* under the turn would go out while it was waiting.
       */
      if (!signal.aborted) setSending(false);
    }
    return voiced.text();
  }

  /**
   * Stops the turn in flight, from the composer.
   *
   * Two things, because a text chat no longer stops just because its reader
   * left: leaving is asynchronous now and the answer is kept for when the
   * person comes back (#335). So closing the connection is no longer enough to
   * stop the model - it would go on writing an answer to the history nobody
   * asked to keep - and Stop also tells the server to hang up, through the
   * interrupt door. The abort still closes the stream this browser is reading;
   * the interrupt is what ends the model call. Pressing Stop is the one place
   * the two are meant together.
   */
  /**
   * Reads the answer being written on a chat the page has just opened, where
   * there is one. Issue #201.
   *
   * Drawn exactly as a send draws its answer - an empty turn on the end of the
   * log, grown piece by piece, the thinking and the lookups beside it - because
   * it is the same answer, read from its first frame. The composer says a turn
   * is in flight and offers Stop, which ends it on the server as it would for a
   * send. Once it is over the history is read back where it did not finish -
   * stopped or failed - because the server keeps nothing of an answer that did
   * not, and the half drawn here is not what the chat says.
   */
  async function followAnswer(id: string, followed: AbortController, open: () => boolean, wait = false): Promise<boolean> {
    let picked = false;
    let finished = false;
    let failure: string | null = null;
    try {
      await followChat(
        id,
        {
          onFollowing: () => {
            if (!open()) return;
            picked = true;
            asking.current = followed;
            setSending(true);
            setWorking(NOTHING_YET);
            thinkingSoFar.current = '';
            setMessages((present) => [
              ...present,
              { role: 'assistant', content: '', actor: null, takes: [], thinking: null, thinkingMillis: null, at: null },
            ]);
          },
          onChunk: (piece) =>
            setMessages((present) => {
              const grown = [...present];
              const last = grown.length - 1;
              grown[last] = { ...grown[last], content: grown[last].content + piece };
              return grown;
            }),
          ...watchWorking(),
          onDone: (spend) => {
            finished = true;
            keepThinkingOnAnswer(spend);
          },
          onError: (reason) => {
            failure = reason;
          },
        },
        followed.signal,
        wait,
      );
    } catch (cause) {
      if (!givenUp(cause)) failure = cause instanceof Error ? cause.message : t('The model did not answer.');
    }
    if (!picked || !open()) return picked;
    if (asking.current === followed) {
      asking.current = null;
      setSending(false);
    }
    if (failure !== null) setError(failure);
    if (!finished) fetchChatMessages(id).then((held) => open() && setMessages(held)).catch(() => undefined);
    else await loadSessions(id).catch(() => undefined);
    return true;
  }

  function handleStop() {
    if (currentId !== null) interruptChat(currentId).catch(() => undefined);
    asking.current?.abort();
    asking.current = null;
  }

  /**
   * The commands the draft is asking for, or none.
   *
   * A slash only opens the menu at the very start of the box. Mid-sentence a
   * slash is a slash - a path, a date, "and/or" - and a menu that appeared
   * there would be a menu appearing while somebody wrote an ordinary message.
   */
  const offered =
    !commandsShut && draft.startsWith('/') && !draft.slice(1).includes(' ')
      ? commands.filter((one) => one.name.startsWith(draft.slice(1).toLowerCase()))
      : [];

  /** Which one Enter would run: the row under the caret, or the only match. */
  const chosen = offered.length === 0 ? null : offered[Math.max(0, Math.min(commandAt, offered.length - 1))];

  /*
   * The skill command being typed, or none. The marker is whatever this
   * workspace uses - it is a setting, so nothing here names one.
   *
   * Unlike a slash, a skill command may be any word of the message, because
   * the server reads every word that starts with the marker. It must start the
   * word, though: `a!b` is not a command there, so it opens no menu here.
   */
  const marker = workspaceMarker ?? installationMarker;
  const skillWord = (() => {
    if (marker === null || marker === '' || commandsShut || offered.length > 0) return null;
    const at = Math.min(caret, draft.length);
    const start = draft.slice(0, at).search(/\S*$/);
    const rest = draft.slice(at).search(/\s|$/);
    const typed = draft.slice(start, at);
    if (!typed.startsWith(marker)) return null;
    const prefix = typed.slice(marker.length);
    if (!/^[A-Za-z_-]*$/.test(prefix)) return null;
    return { start, end: at + rest, prefix: prefix.toLowerCase() };
  })();
  const chatAgent = current?.agentId == null ? null : (agents.find((one) => one.id === current.agentId) ?? null);
  const skillsOffered =
    skillWord === null
      ? []
      : reachableSkills(skillOffers, chatAgent).filter((one) => one.key.toLowerCase().startsWith(skillWord.prefix));
  const skillChosen =
    skillsOffered.length === 0 ? null : skillsOffered[Math.max(0, Math.min(skillAt, skillsOffered.length - 1))];

  /** Writes the word under the caret as the skill's command, and leaves the caret after it. */
  function completeSkill(skill: SkillOffer) {
    if (skillWord === null || marker === null) return;
    const word = `${marker}${skill.key} `;
    const after = draft.slice(skillWord.end).replace(/^[ \t]/, '');
    setDraft(draft.slice(0, skillWord.start) + word + after);
    caretAfter.current = skillWord.start + word.length;
    setCaret(caretAfter.current);
    setSkillAt(-1);
  }

  useLayoutEffect(() => {
    if (caretAfter.current === null) return;
    composerRef.current?.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  }, [draft]);

  /*
   * Sentence completion, issue #649.
   *
   * Asked after a pause in the typing, only with the caret at the end of
   * something typed, and never while a menu is open or a message is going: a
   * suggestion is for the sentence being written and nothing else. The timer
   * and the request are both thrown away when anything changes, so typing is
   * never waited on and an answer for text that is no longer there is never
   * drawn. A request that fails shows nothing - the person asked for nothing.
   */
  const menuOpen = offered.length > 0 || skillsOffered.length > 0;
  /*
   * The asking itself is `useInlineCompletion`'s, which the document editor
   * shares: the pause, the abort, and an answer for text since typed through.
   */
  const { setSuggestion, rest: stillSuggested } = useInlineCompletion({
    pause: completionPause,
    text: draft,
    ready: currentId !== null && !sending && !menuOpen && caret === draft.length,
    scope: currentId,
    ask: (asked, signal) => (currentId === null ? Promise.resolve(null) : fetchChatCompletion(currentId, asked, signal)),
  });

  /** What is drawn after the caret: only for the text it was asked for, or that text typed on along it, with the caret at its end. */
  const ghost = caret === draft.length && !menuOpen && !sending ? stillSuggested(draft) : null;

  /*
   * Suggested replies under the latest answer.
   *
   * Asked once the answer is finished, in a workspace with a Completion model,
   * and only while nothing is typed or attached: the chips are a way to start a
   * message, and somebody already writing one has started. Keyed by the answer
   * they are for, so a new answer asks again and a reload is answered from what
   * the server kept. A click sends the reply as it is - the composer is empty
   * whenever they are shown, so nothing typed is ever replaced - and sending
   * anything takes them away, because the answer they replied to is no longer
   * the last thing said.
   */
  const lastMessage = messages.length === 0 ? null : messages[messages.length - 1];
  const repliesFor =
    currentId !== null && completionPause !== null && !sending && lastMessage?.role === 'assistant' && lastMessage.content.trim() !== ''
      ? `${currentId}:${messages.length}:${lastMessage.content}`
      : null;
  const [replies, setReplies] = useState<{ answer: string; lines: string[] } | null>(null);
  useEffect(() => {
    if (repliesFor === null || currentId === null) return;
    const chatAsked = currentId;
    const controller = new AbortController();
    fetchChatReplySuggestions(chatAsked, controller.signal)
      .then((lines) => {
        if (controller.signal.aborted) return;
        // Plain text, one line each, whatever the model wrote.
        const plain = lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line !== '');
        setReplies({ answer: repliesFor, lines: plain });
      })
      .catch(() => undefined);
    return () => controller.abort();
    // currentId is part of repliesFor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repliesFor]);
  const replyChips =
    replies !== null && replies.answer === repliesFor && draft.trim() === '' && attached.length === 0 && replies.lines.length > 0
      ? replies.lines
      : null;

  /*
   * The grey copy laid exactly over the box, so the suggestion starts where the
   * typed text ends - including where that is part way along a wrapped line.
   * Measured off the textarea rather than styled to match it, because its
   * height and scroll are written by the layout effect that grows it.
   */
  const grewForGhost = useRef(false);
  useLayoutEffect(() => {
    const box = composerRef.current;
    const over = ghostRef.current;
    if (box === null) return;
    if (over === null) {
      // The suggestion is gone: back to the height of what is typed.
      if (grewForGhost.current) {
        grewForGhost.current = false;
        fitComposer(box);
      }
      return;
    }
    over.style.width = `${box.clientWidth}px`;
    /*
     * A suggestion longer than the lines typed so far would be cut off at the
     * box's edge, so the box grows to show it - within the room it may take -
     * and gives the room back when the suggestion goes.
     */
    over.style.height = 'auto';
    if (over.scrollHeight > box.clientHeight) {
      fitComposer(box, over.scrollHeight);
      grewForGhost.current = true;
    }
    over.style.left = `${box.offsetLeft}px`;
    over.style.top = `${box.offsetTop}px`;
    over.style.height = `${box.clientHeight}px`;
    over.scrollTop = box.scrollTop;
    // fitComposer reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, draft]);

  /*
   * The row the arrows reached, kept in sight. The menus scroll past eight or
   * so rows, and a highlight moved below the fold is a choice nobody can see.
   */
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>('[role="listbox"] [role="option"][aria-selected="true"]')
      .forEach((row) => row.scrollIntoView({ block: 'nearest' }));
  }, [commandAt, skillAt]);

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    /*
     * The menu takes the arrows and Enter while it is open, and nothing else.
     * Escape closes it without clearing what was typed, because somebody who
     * meant to write a message starting with a slash should not lose the line.
     */
    if (offered.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        // From the row drawn highlighted, which is the first while nothing has been moved to.
        setCommandAt((at) => (Math.max(at, 0) + 1) % offered.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCommandAt((at) => (at <= 0 ? offered.length - 1 : at - 1));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setCommandAt(-1);
        setCommandsShut(true);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && chosen !== null) {
        /*
         * Completed rather than run. A command with an argument is not finished
         * being typed, and one without is still a thing with consequences -
         * `/workflow` really runs it - so the first Enter fills the box and the
         * second, on a line the person has read, is the one that acts.
         */
        event.preventDefault();
        setDraft(`/${chosen.name}${chosen.argument === null ? '' : ' '}`);
        setCommandAt(-1);
        return;
      }
    }

    if (skillsOffered.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSkillAt((at) => (Math.max(at, 0) + 1) % skillsOffered.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSkillAt((at) => (at <= 0 ? skillsOffered.length - 1 : at - 1));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSkillAt(-1);
        setCommandsShut(true);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && skillChosen !== null) {
        event.preventDefault();
        completeSkill(skillChosen);
        return;
      }
    }

    /*
     * A suggestion is taken with Tab and put away with Escape, the way the
     * menus above complete and close. Anything else typed simply carries on
     * writing, which changes the text and takes the suggestion away with it.
     */
    if (ghost !== null && event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      const taken = draft + ghost;
      setDraft(taken);
      caretAfter.current = taken.length;
      setCaret(taken.length);
      setSuggestion(null);
      return;
    }
    if (ghost !== null && event.key === 'Escape') {
      event.preventDefault();
      setSuggestion(null);
      return;
    }

    // Enter sends, shift+enter is a new line: what a chat box is expected to do.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend(event as unknown as FormEvent);
    }
  }

  async function handleRename(entry: ChatSession) {
    const title = window.prompt(t('Rename chat'), entry.title);
    if (title === null || title.trim() === '') return;
    await guard(async () => {
      await renameChat(entry.id, title.trim());
      await loadSessions();
    });
    setMenuFor(null);
  }

  /*
   * Deleting a chat takes every message in it and there is no way back, so it
   * asks. It did not: the button deleted, from the header and from the row menu
   * both, on one press and with nothing said.
   */
  function handleDelete(entry: ChatSession) {
    setMenuFor(null);
    setDeleting(entry);
  }

  async function confirmDelete() {
    const entry = deleting;
    if (entry === null) return;
    await guard(async () => {
      await deleteChat(entry.id);
      setCurrentId((present) => (present === entry.id ? null : present));
      await loadSessions();
    });
    setDeleting(null);
  }

  async function handlePin(entry: ChatSession) {
    /*
     * Moved at once, then confirmed: the server takes milliseconds, and waiting
     * for the whole chat list to come back made a pin take seconds to show.
     */
    const pinned = !entry.pinned;
    setMenuFor(null);
    setSessions((held) => held?.map((one) => (one.id === entry.id ? { ...one, pinned } : one)) ?? held);
    await guard(async () => {
      try {
        await setChatPinned(entry.id, pinned);
      } catch (cause) {
        setSessions((held) => held?.map((one) => (one.id === entry.id ? { ...one, pinned: entry.pinned } : one)) ?? held);
        throw cause;
      }
    });
  }

  /**
   * What the picker offers is who answers next, and an agent answers by
   * supplying its own model, so choosing one settles both.
   *
   * One call where there used to be two. `chooseChatModel` was the other, and
   * it took the agent off and left the model — a chat on a bare model made in
   * one press, which is the thing issue #295 removed.
   */
  async function handleChoose(id: string) {
    if (currentId === null) return;
    await guard(async () => {
      await chooseChatAgent(currentId, id);
      await loadSessions(currentId);
    });
    setPickerOpen(false);
    setPickerSearch('');
  }

  /**
   * Which take of an answer is being read: 0 for the first it ever gave,
   * `takes.length` for the one that stands.
   *
   * The one that stands is the default, and the only one an answer with no
   * earlier takes has.
   */
  const takeShowing = (index: number, message: ChatMessage): number =>
    Math.min(takeAt[index] ?? message.takes.length, message.takes.length);

  /** And what that take actually said. */
  const shownTake = (index: number, message: ChatMessage): string => {
    const at = takeShowing(index, message);
    return at === message.takes.length ? message.content : message.takes[at];
  };

  const stepTake = (index: number, message: ChatMessage, by: number) => {
    const next = Math.max(0, Math.min(message.takes.length, takeShowing(index, message) + by));
    setTakeAt((held) => ({ ...held, [index]: next }));
  };

  /*
   * Through `copyText`, which falls back to a selection where the browser
   * withholds `navigator.clipboard` - every plain-http address on a LAN. Says
   * what happened either way: "Copied" over an empty clipboard is a lie.
   */
  async function copy(text: string, index: number) {
    const ok = await copyText(text);
    setCopied({ index, ok });
    window.setTimeout(
      () => setCopied((present) => (present?.index === index ? null : present)),
      ok ? 1200 : 4000,
    );
  }

  const copySaid = (index: number) =>
    copied?.index !== index ? null : copied.ok ? (
      <span className={styles.copied} role="status">{t('Copied')}</span>
    ) : (
      <span className={styles.copyFailed} role="status">{t('Could not copy - select it and copy by hand')}</span>
    );

  /*
   * What the send button says while a turn is in flight.
   *
   * It said "Sending…" from the press until the answer was complete, which is
   * only true for the first few hundred bytes of it: the message is written to
   * the history before the stream opens, and everything after that is the model
   * thinking. Minutes of "Sending…" reads as a message that never left, and the
   * screen was already contradicting itself - the log says "Waiting for Gemma
   * 31B…" while the button says the message is still going out.
   *
   * So it is derived from exactly what that row is derived from, and the two
   * cannot disagree: an assistant turn that is still empty is the wait, and the
   * first token that lands in it is the model answering.
   */
  const answering = sending && (messages[messages.length - 1]?.content ?? '') !== '';
  /*
   * In voice mode it stays *Send* and stays live, because there it does
   * something different: the panel is the sender, and pressing this while a
   * turn is in flight puts what was typed in the queue rather than nowhere.
   * A button labelled with the turn's progress and refusing the press would be
   * the same message lost that voice mode was just taught to keep.
   *
   * In a chat with an agent it says Send again as soon as something is typed
   * mid-turn, because then pressing it writes into the turn; until then it
   * keeps saying what the turn is doing.
   */
  const sendLabel =
    voice || !sending || (current?.agentId != null && draft.trim() !== '')
      ? 'Send'
      : answering
        ? t('Answering…')
        : t('Waiting…');

  /*
   * One banner, drawn in whichever half is showing. It cannot simply sit above
   * both: the chat pane cancels the shell's padding with a negative margin and
   * would ride up over it, so anything failing while no chat is open would be
   * reported invisibly — which is exactly how a dead workspace hid itself.
   */
  const passingBanner =
    passing === null ? null : (
      <p className={styles.error} role="status" data-chat-passing="">
        {passing}
      </p>
    );

  const errorBanner =
    error === null ? null : (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );

  /*
   * Collapsed, the chat menu is two things: start one, or find one. A list of
   * titles squeezed into 64px is unreadable, and a search box with nowhere to
   * type is worse than none — so searching opens the column first and puts the
   * caret where it belongs.
   */
  const sidebar = collapsed ? (
    <div className={styles.sidebarCollapsed}>
      <button
        type="button"
        className={styles.collapsedAction}
        onClick={() => void handleNew()}
        disabled={noAgents}
        aria-label={t('New chat')}
        title={noAgents ? t('This workspace has no agent to chat with yet.') : t('New chat')}
      >
        <img src={plusIcon} alt="" width={14} height={14} />
      </button>
      <button
        type="button"
        className={styles.collapsedAction}
        onClick={() => {
          wantsSearch.current = true;
          setSidebarCollapsed(false);
        }}
        aria-label={t('Search chats')}
        title={t('Search chats')}
      >
        <img src={searchIcon} alt="" width={14} height={14} />
      </button>
    </div>
  ) : (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>{t('User Chats')}</span>
        <button
          type="button"
          className={styles.newButton}
          onClick={() => void handleNew()}
          disabled={noAgents}
          title={noAgents ? t('This workspace has no agent to chat with yet.') : undefined}
        >{t('+ New')}</button>
      </div>

      <div className={styles.searchBox}>
        <img src={searchIcon} alt="" width={11} height={11} />
        <input
          ref={searchRef}
          className={styles.searchInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search chats...')}
          aria-label={t('Search chats')}
        />
      </div>

      <label className={styles.searchScope}>
        <input
          type="checkbox"
          checked={searchInMessages}
          onChange={(event) => setSearchInMessages(event.target.checked)}
        />
        {t('Search content')}
      </label>

      {sessions === null && <p className={styles.sidebarNotice}><Loader /></p>}
      {sessions?.length === 0 && <p className={styles.sidebarNotice}>{t('No chats yet.')}</p>}

      {pinned.length > 0 && (
        <>
          <button type="button" className={styles.sectionHeader} onClick={() => setPinnedOpen(!pinnedOpen)}>
            <img
              className={pinnedOpen ? styles.sectionChevronOpen : styles.sectionChevron}
              src={chevronDown12Icon}
              alt=""
              width={8}
              height={6}
            />
            {t('Pinned')}
          </button>
          {pinnedOpen && (
            <div className={styles.sessionList}>
              {pinned.map((entry) => (
                <SessionRow
                  key={entry.id}
                  entry={entry}
                  current={entry.id === currentId}
                  naming={naming === entry.id}
                  looking={looking}
                  pinnedRow
                  menuOpen={menuFor === entry.id}
                  onSelect={() => setCurrentId(entry.id)}
                  onMenu={() => setMenuFor(menuFor === entry.id ? null : entry.id)}
                  onPin={() => void handlePin(entry)}
                  onRename={() => void handleRename(entry)}
                  onDelete={() => handleDelete(entry)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {recent.length > 0 && (
        <>
          <button type="button" className={styles.sectionHeader} onClick={() => setRecentOpen(!recentOpen)}>
            <img
              className={recentOpen ? styles.sectionChevronOpen : styles.sectionChevron}
              src={chevronDown12Icon}
              alt=""
              width={8}
              height={6}
            />
            {t('Recent')}
          </button>
          {recentOpen && (
            <div className={styles.sessionList}>
              {recent.map((entry) => (
                <SessionRow
                  key={entry.id}
                  entry={entry}
                  current={entry.id === currentId}
                  naming={naming === entry.id}
                  looking={looking}
                  menuOpen={menuFor === entry.id}
                  onSelect={() => setCurrentId(entry.id)}
                  onMenu={() => setMenuFor(menuFor === entry.id ? null : entry.id)}
                  onPin={() => void handlePin(entry)}
                  onRename={() => void handleRename(entry)}
                  onDelete={() => handleDelete(entry)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  if (chatOff) {
    return (
      <AppShell
        user={shellUser(session)}
        section="chat"
        showAdmin={session.admin}
        onSignOut={onSignOut}
        sidebar={null}
        hideSidebar
      >
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{t('Chat is turned off')}</p>
          <p className={styles.emptyNote}>
            {t('An administrator has switched chat off for this installation. The conversations already had are kept, and come back if it is switched on again.')}
          </p>
        </div>
      </AppShell>
    );
  }

  /*
   * What the viewer can step through, which is only ever one of these two rows.
   *
   * The picture that is open decides which: the files already sent and the ones
   * still being written are separate groups on screen, and arrowing out of the
   * one that was clicked into the other would be a surprise. Ids are unique, so
   * the group is simply whichever row holds it.
   */
  const chatPictures = chatFiles.filter((file) => isShowable(file.contentType));
  const composerPictures = attached.filter((file) => isShowable(file.contentType));
  const previewPictures = composerPictures.some((file) => file.id === previewId)
    ? composerPictures
    : chatPictures;

  /*
   * What to print beside the time, or null for nothing to print.
   *
   * Money where the model has prices and tokens where it has none - a bill is
   * one number, and a model nobody has priced can still say how much was read
   * and written. Null where the switch is off, where the provider reported no
   * counts, and for every answer that came back out of the history: three
   * different reasons to know nothing, and one honest way of showing it.
   */
  const spend =
    session.chatCostShown !== false && lastSpend !== null && spendKnown(lastSpend)
      ? lastSpend.cost === null
        ? `${tokenCount(lastSpend.inputTokens + lastSpend.outputTokens)} tokens`
        : costAmount(lastSpend.cost)
      : null;

  /*
   * What this chat has spent altogether, under the corner of the composer.
   *
   * The whole conversation and not the last answer, which is the difference
   * that makes it worth drawing. It used to be `lastSpend`, which came off the
   * stream's last frame and was held here in the browser - so a chat said what
   * its newest answer cost and, the moment the page reloaded, nothing at all.
   * This comes off the chat row, is added to as each turn lands, and is still
   * there a week later.
   *
   * Nothing is added up here. The server keeps the total and the sidebar is
   * re-read at the end of every turn, so the number on screen is the number in
   * the database rather than a second tally kept beside it - which is the tally
   * that would start again from nought on a reload, in a second tab, or on
   * another machine.
   *
   * Silent on nought, and nought covers every case where the truth is "not
   * recorded": a chat nobody has spoken in, a provider that reported no counts,
   * and a chat older than the column. Same rule as the per-answer line, and for
   * the same reason - a conversation that says it cost nothing is worse than
   * one that says nothing.
   */
  const spentTokens = (current?.spentInputTokens ?? 0) + (current?.spentOutputTokens ?? 0);
  const spentPictures = current?.spentPictures ?? 0;
  /*
   * Pictures are said beside the tokens, never folded into them.
   *
   * An image model charges per picture and reports no counts at all. Counted
   * the ordinary way a drawing adds nought, which would leave a chat that spent
   * real money on pictures reading as a chat that spent nothing.
   */
  /*
   * With what the provider reused from its cache beside it. Every round sends
   * the whole conversation, so a long session's input reads as millions of
   * tokens a local server mostly never read again. Issue #627.
   */
  const spentCached = current?.spentCachedInputTokens ?? 0;
  const spentPart =
    spentTokens === 0
      ? null
      : spentCached > 0
        ? tf('{tokens} tokens ({cached} cached)', { tokens: tokenCount(spentTokens), cached: tokenCount(spentCached) })
        : `${tokenCount(spentTokens)} ${t('tokens')}`;
  const drawnPart =
    spentPictures === 0
      ? null
      : spentPictures === 1
        ? t('1 picture')
        : tf('{count} pictures', { count: tokenCount(spentPictures) });
  const spent =
    session.chatCostShown === false
      ? null
      : spentPart !== null && drawnPart !== null
        ? tf('{tokens} and {pictures}', { tokens: spentPart, pictures: drawnPart })
        : (spentPart ?? drawnPart);

  /** Sent and not begun: the last turn is still empty and nothing has been looked up on the way. */
  const waitingNow = sending && messages[messages.length - 1]?.content === '' && !anyWorking(working);
  const waitingLine = (
    <p className={styles.waiting} data-waiting="">
      {tf('Waiting for {name}…', { name: current?.agentName ?? current?.modelName ?? t('the model') })}
    </p>
  );
  return (
    <AppShell
      user={shellUser(session)}
      section="chat"
      showAdmin={session.admin}
      onSignOut={onSignOut}
      sidebar={sidebar}
      // The chat list's names are cut off at the shell's width; this one may be dragged wider.
      sidebarResizeKey="orknux.chat.sidebar.width"
      fills
    >
      {current === null ? (
        <div className={styles.empty}>
          {errorBanner}
          {passingBanner}
          <p className={styles.emptyTitle}>{noAgents ? t('No agent to chat with') : t('No chat open')}</p>
          {/*
            The way out stays in the open; what a chat *is* goes behind the (?).

            Two ways out, because there are now two reasons to be here. A
            workspace with no usable agent is a workspace where "+ New" does
            nothing, and that is a state issue #295 created — a bare model used
            to be there whatever else was. Telling somebody to press a button
            that is switched off is worse than telling them nothing, so the
            sentence names what is missing and links to where it is made.
          */}
          {noAgents ? (
            <p className={styles.emptyNote}>
              <span className={styles.labelWithHint}>
                <Link to={`/workspace/${workspaceId}/agents`}>{t('Add an agent')}</Link>
                <FieldHint label={t('No agent to chat with')}>
                  {t('A chat is held with an agent: it brings the model that answers, the instructions it works under, the skills and tools it has been granted, and what it is allowed to remember. There is nothing else to hold one with.')}
                </FieldHint>
              </span>
            </p>
          ) : (
            <p className={styles.emptyNote}>
              <span className={styles.labelWithHint}>
                Start one with <strong>{t('+ New')}</strong>.
                <FieldHint label={t('No chat open')}>
                  {t('Each chat is a conversation of its own, kept the same way a workflow run keeps the thread its agents share.')}
                </FieldHint>
              </span>
            </p>
          )}
        </div>
      ) : (
        <div className={styles.chatRow}>
        {/*
          Files dropped anywhere on the conversation are attached, as the
          attach button and a pasted picture are. Without this a dropped file
          was the browser's to handle: it opened the picture in place of the
          chat, and in the desktop app replaced the whole window with it.
        */}
        <div
          className={styles.chat}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = attachmentsAllowed ? 'copy' : 'none';
            if (attachmentsAllowed) setDropping(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            setDropping(false);
            if (attachmentsAllowed) void handleFiles(Array.from(event.dataTransfer.files));
          }}
        >
          {dropping && (
            <div className={styles.dropZone} data-testid="chat-drop-zone" aria-hidden="true">
              {t('Drop to attach')}
            </div>
          )}
          {/*
            One row, not two.

            The title had a row and the model picker had another below it, and
            the second held a single word - so two thirds of a bar of chrome
            said what belongs beside the chat's name. Who answers next is now
            read in the same glance as what the chat is called, immediately
            left of the controls that act on it.
          */}
          <header className={styles.titleBar}>
            {/* In place of "New chat" while the title is generated: the words that are about to be replaced, replaced. */}
            <h1 className={styles.chatTitle}>
              {naming === current.id ? (
                <span className={styles.naming} role="status" data-testid="chat-naming">
                  <span className={styles.namingDot} aria-hidden="true" />
                  {t('Naming this chat…')}
                </span>
              ) : (
                current.title
              )}
            </h1>
            <div className={styles.titleRight}>
            <div className={styles.modelBar} ref={pickerRef}>
              <button
                type="button"
                className={styles.modelButton}
                onClick={() => {
                  setPickerOpen(!pickerOpen);
                  setPickerFocus(null);
                }}
                aria-expanded={pickerOpen}
              >
                <span className={current.modelName === null ? styles.modelUnset : styles.modelName}>
                  {current.agentName ?? current.modelName ?? t('Choose a model')}
                </span>
                <img src={chevronDown12Icon} alt="" width={12} height={12} />
              </button>

              {/*
                One list, and it is agents.

                It used to be two tabs, Agents then Models, with agents first
                (issue #249) on the argument that what somebody chats to is
                nearly always an agent: it brings its instructions, its skills
                and its tools with it, and it supplies a model anyway, so
                offering the bare models put the raw material ahead of the thing
                made out of it.

                Issue #295 finished that argument by taking the second half
                away. A bare model is that same agent with the instructions, the
                skills, the grants and the memory taken off, and a tab beside
                them said it was the other half of a choice. A chat that is
                already on one keeps working, and the button above still shows
                its model's name — read off the chat as `modelName`, not out of
                a list — so what this offers is the agents it could be handed to.
              */}
              {pickerOpen && (
                <div className={styles.picker}>
                  <div className={styles.pickerSearch}>
                    <img src={searchIcon} alt="" width={14} height={14} />
                    <input
                      className={styles.searchInput}
                      value={pickerSearch}
                      onChange={(event) => {
                        setPickerSearch(event.target.value);
                        setPickerFocus(null);
                      }}
                      onKeyDown={(event) => {
                        /*
                          Up and down walk the agents that can answer, Enter
                          takes the one walked to - or the first, so typing a
                          name and pressing Enter is enough.
                        */
                        const choosable = pickerEntries.filter((entry) => entry.enabled);
                        if (choosable.length === 0) return;
                        const at = choosable.findIndex((entry) => entry.id === pickerFocus);
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          const step = event.key === 'ArrowDown' ? 1 : -1;
                          const next = at === -1 ? (step === 1 ? 0 : choosable.length - 1) : (at + step + choosable.length) % choosable.length;
                          setPickerFocus(choosable[next].id);
                          document.querySelector(`[data-picker-entry="${choosable[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
                        } else if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleChoose((at === -1 ? choosable[0] : choosable[at]).id);
                        }
                      }}
                      placeholder={t('Search')}
                      aria-label={t('Search models')}
                      autoFocus
                    />
                  </div>
                  <div className={styles.pickerList}>
                    {/*
                      Three things the list can have nothing in it for, and they
                      are not the same thing: the workspace has none, the fetch
                      failed, or what was typed above matches none of them.
                    */}
                    <CatalogueNote
                      catalogue={agentCatalogue}
                      className={styles.pickerEmpty}
                      empty={t('No agents in this workspace yet.')}
                    />
                    {pickerEntries.length === 0 && agents.length > 0 && (
                      <p className={styles.pickerEmpty}>{t('Nothing by that name.')}</p>
                    )}
                    {pickerEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={[
                          entry.id === current.agentId ? styles.pickerEntryCurrent : styles.pickerEntry,
                          entry.id === pickerFocus ? styles.pickerEntryFocused : '',
                        ].join(' ')}
                        data-picker-entry={entry.id}
                        data-focused={entry.id === pickerFocus ? 'true' : undefined}
                        // An agent switched off, or with no model chosen, cannot
                        // answer; the server says so too, but there is no reason
                        // to offer it as a choice.
                        disabled={!entry.enabled}
                        title={entry.enabled ? undefined : t('Not active')}
                        onClick={() => void handleChoose(entry.id)}
                      >
                        {entry.label}
                        {!entry.enabled && <span className={styles.pickerNote}>{t('inactive')}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/*
                The way out to whatever is answering.

                The name in the picker is the only place this chat says which
                agent or model it is talking to, and it was a dead word: finding
                the agent whose prompt produced an answer meant leaving the chat,
                opening the workspace's agent list and reading down it for a name
                you were holding in your head. It is one press now, in a tab of
                its own - the same arrow-leaving-a-box every other field that
                names a definition uses, so it is read without being explained.

                An agent when there is one, the model when there is not: that is
                the same precedence the button beside it draws the name with, and
                a link that went somewhere other than the name it sits next to
                would be a worse answer than none.
              */}
              {workspaceId !== null && (current.agentId !== null || current.modelId !== null) && (
                <Link
                  className={styles.definitionJump}
                  to={
                    current.agentId !== null
                      ? `/workspace/${workspaceId}/agents/${current.agentId}/settings`
                      : `/workspace/${workspaceId}/models/${current.modelId}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  title={`Opens ${current.agentName ?? current.modelName} in a new tab`}
                  aria-label={
                    current.agentId !== null
                      ? `Open the agent ${current.agentName}`
                      : `Open the model ${current.modelName}`
                  }
                >
                  <OpenDefinitionIcon />
                </Link>
              )}
            </div>
            <div className={styles.titleActions}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => {
                  /*
                   * Opens a strip under the title, and the strip searches this
                   * conversation.
                   *
                   * It focused a hidden read-only input to begin with, so it
                   * did nothing at all. Then it focused the sidebar's box,
                   * which was wrong in a subtler way: that box asks "which chat
                   * was that in" and filters a list of titles, and this control
                   * sits above the conversation rather than above the list.
                   * What is wanted here is where in this one it was said.
                   */
                  if (finding) {
                    closeFind();
                    return;
                  }
                  setFinding(true);
                  window.setTimeout(() => findRef.current?.focus(), 0);
                }}
                title={t('Find in this chat')}
                aria-label={t('Find in this chat')}
                aria-expanded={finding}
              >
                <img src={searchIcon} alt="" width={14} height={14} />
              </button>
              {/*
                A chat opened from a session, said as a mark rather than a
                sentence across the page.

                It used to be a strip above the log reading "Continuing an LLM
                session — what is said here is written into it", with a link on
                the end. A line of prose the full width of the conversation, on
                every send, to say something that is true of the whole chat and
                changes never. The words are not lost: they are what the title
                and the label say, which is where the product puts an
                explanation of a control.

                `OpenDefinitionIcon` because that is already the mark for
                "opens the thing this names, elsewhere" - the five ways out of
                the node panel were converted to it, and a second mark invented
                here would be a second thing to learn for the same idea.
              */}
              {current.llmSessionId !== null && (
                <Link
                  className={styles.iconButton}
                  to={`/workspace/${current.workspaceId}/sessions/${current.llmSessionId}`}
                  target="_blank"
                  rel="noreferrer"
                  title={t('Continuing an LLM session — what is said here is written into it')}
                  aria-label={t('Open the transcript')}
                  data-chat-session-link=""
                >
                  <OpenDefinitionIcon />
                </Link>
              )}
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => void handleRename(current)}
                title={t('Rename this chat')}
                aria-label={t('Rename this chat')}
              >
                <img src={penIcon} alt="" width={14} height={14} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => handleDelete(current)}
                title={t('Delete this chat')}
                aria-label={t('Delete this chat')}
              >
                <img src={trashIcon} alt="" width={14} height={14} />
              </button>
            </div>
            </div>
          </header>

          {/*
            Under the title rather than inside it: the title row was two rows
            until an hour ago and putting a field back into it would undo that,
            and a strip that appears and goes is easier to read as a mode you
            are in than a field that was always there.
          */}
          {finding && (
            <div className={styles.findBar}>
              <img src={searchIcon} alt="" width={14} height={14} />
              <input
                ref={findRef}
                className={styles.findInput}
                value={find}
                onChange={(event) => setFind(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeFind();
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    stepFind(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder={t('Find in this chat')}
                aria-label={t('Find in this chat')}
              />
              <span className={styles.findCount} role="status">
                {find.trim() === ''
                  ? ''
                  : findHits.length === 0
                    ? 'Nothing'
                    : `${findAt + 1} of ${findHits.length}`}
              </span>
              <span className={styles.findSteps}>
                <button
                  type="button"
                  className={styles.findStep}
                  onClick={() => stepFind(-1)}
                  disabled={findHits.length === 0}
                  aria-label={t('Previous match')}
                  title={t('Previous match')}
                >
                  <img src={chevronDown12Icon} alt="" width={12} height={12} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <button
                  type="button"
                  className={styles.findStep}
                  onClick={() => stepFind(1)}
                  disabled={findHits.length === 0}
                  aria-label={t('Next match')}
                  title={t('Next match')}
                >
                  <img src={chevronDown12Icon} alt="" width={12} height={12} />
                </button>
              </span>
              <button type="button" className={styles.findStep} onClick={closeFind} aria-label={t('Close find')} title={t('Close find')}>
                <img src={xIcon} alt="" width={12} height={12} />
              </button>
            </div>
          )}

          <div
            className={styles.log}
            ref={(box) => {
              logRef.current = box;
              setLogBox(box);
            }}
          >
            {messages.length === 0 && (
              <p className={styles.logEmpty}>Nothing said yet. What is typed below starts the conversation.</p>
            )}

            {messages.map((message, index) => (
              <Fragment key={index}>
              {(placedReviews.get(index) ?? []).map(({ review, taken }) => (
                <ReviewLine key={`review-${review.id}-${taken}`} review={review} taken={taken} />
              ))}
              {(placedRequests.get(index) ?? []).map((request) => (
                <div key={`request-${request.id}`} className={styles.requestRow}>
                  <InteractionCard request={request} onAnswered={answeredRequest} />
                </div>
              ))}
              {/*
                A call is not a turn and is not drawn as one: it was made
                between two of them, by the agent, and the page it was carried
                out of already says so this way.

                `CallLine` is the drawing, and it is also what a task's page
                uses. No `result` passed, and that is the chat's own shape rather
                than an omission: what it carries from the session it continues
                is the calls that were made, and the data they returned belongs
                in front of the model rather than in the thread.
              */}
              {message.compaction != null ? (
                /*
                  The note a compaction left, with the summary it made folded
                  inside it. Collapsed by default - it is a housekeeping line,
                  not a turn, and somebody reading the conversation should not
                  have a summary of the part they already read pushed in front
                  of what came next. Open it to see what was kept. Issue #332.
                */
                <details className={styles.compaction}>
                  <summary className={styles.compactionLine}>{message.content}</summary>
                  <div className={styles.compactionSummary}>{message.compaction.summary}</div>
                </details>
              ) : message.role === CALL_ROLE ? (
                <>
                {turnHead.has(index) && turnHeader(index)}
                <div className={`${styles.call} ${styles.turnContinued}`} data-turn-line={turnOf.get(index)}>
                  {/*
                    Folded, the same as one arriving live.
                    
                    These come back from the session the chat continues, and a
                    call read out of history is no more the conversation than one
                    watched being made - so it is one line here too, and opens on
                    a press. The live site below passes the same thing; a call
                    that folded while it happened and sprawled after a reload
                    would be two different pages.
                  */}
                  <CallLine actor={message.actor} content={message.content} when={calledAt(message.at)} link={message.link} folded />
                </div>
                </>
              ) : message.role === THOUGHT_ROLE && (message.thinking ?? '').trim() === '' ? null : message.role === THOUGHT_ROLE ? (
                /*
                  One round's thinking, read back in its place among the calls
                  - the same section the live turn drew there, so a reload
                  reads the way the turn did.
                */
                <>
                {turnHead.has(index) && turnHeader(index)}
                <div className={`${styles.call} ${styles.turnContinued}`} data-thought="" data-turn-line={turnOf.get(index)}>
                  <Thinking text={message.thinking ?? ''} millis={message.thinkingMillis} />
                </div>
                </>
              ) : message.role === 'user' ? (
                <div className={styles.userRow} data-find={findMark(index)}>
                  <div className={styles.userBody}>
                    {/*
                      A carried turn says who put it. It may not have been a
                      person at all - a node's prompt is recorded the same way -
                      and unnamed it reads as something the reader typed.
                    */}
                    {message.actor !== null && <span className={styles.saidBy}>{message.actor}</span>}
                    {sentAt(message.at) !== null && (
                      <span className={styles.sentAt}>{sentAt(message.at)}</span>
                    )}
                    <div className={styles.userBubble}>{message.content}</div>
                    {filesOf(filesUnder(message), 'user')}
                    {/*
                      Under the bubble, inside the body, so it lines up with the
                      bubble's own edge rather than the column's. Outside the
                      body it was drawn in the gutter to the left of a
                      right-aligned message, which is the one place it could sit
                      and not look like it belonged to anything.
                    */}
                    <div className={styles.rowActions}>
                      {/* Before the button, so saying it does not move the button off the bubble's edge. */}
                      {copySaid(index)}
                      <button
                        type="button"
                        className={styles.rowAction}
                        onClick={() => void copy(message.content, index)}
                        title={t('Copy')}
                        aria-label={t('Copy this message')}
                      >
                        <img src={copyIcon} alt="" width={14} height={14} />
                      </button>
                      {/* The chat ends on this message with no answer under it: ask for one, rather than retyping it. */}
                      {index === messages.length - 1 && !sending && (
                        <button
                          type="button"
                          className={styles.rowAction}
                          onClick={() => void handleRegenerate()}
                          title={t('Answer this')}
                          aria-label={t('Answer this')}
                          data-answer-this=""
                        >
                          <img src={refreshCwIcon} alt="" width={14} height={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Theirs beside what they said, as the agent's is beside its answers; a carried turn is signed by whoever put it. */}
                  {session.chatAvatarShown !== false && (
                    <span className={styles.userAvatar} aria-hidden="true" data-user-avatar="">
                      {(message.actor ?? shellUser(session).name).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              ) : carried.has(index) ? null : (
                <div
                  className={turnHead.has(index) ? styles.assistantRow : `${styles.assistantRow} ${styles.turnContinued}`}
                  data-find={findMark(index)}
                  data-turn-line={turnOf.get(index)}
                >
                  {turnHead.has(index) ? (
                    <span className={styles.assistantAvatar} aria-hidden="true">
                      <img src={cpuIcon} alt="" width={16} height={16} />
                    </span>
                  ) : (
                    <span className={styles.assistantAvatarSpace} aria-hidden="true" />
                  )}
                  <div className={styles.assistantBody}>
                    {/*
                      Whoever actually said it. A turn carried in from the
                      session was said by an agent, and signing it with the
                      model this chat happens to be talking to is the most
                      misleading line on a page somebody opened to work out what
                      that agent did.
                    */}
                    {turnHead.has(index) && (
                      <span className={styles.assistantName} data-turn-header="">
                        {turnName(index)}
                      </span>
                    )}
                    {turnHead.has(index) && sentAt(message.at) !== null && (
                      <span className={styles.sentAt}>{sentAt(message.at)}</span>
                    )}
                    {/* The answer not begun yet: said here, under its name, rather than as a second message with the same icon. */}
                    {waitingNow && index === messages.length - 1 && waitingLine}
                    {/* Only the answer just given has a time behind it. */}
                    {/* The time of the turn that wrote this answer, on that answer: a new turn's answer shows none until its own. */}
                    {message.spend !== undefined && index === messages.length - 1 && (
                      <button
                        type="button"
                        className={styles.thought}
                        onClick={() => setThoughtOpen(!thoughtOpen)}
                        aria-expanded={thoughtOpen}
                      >
                        {/*
                          The whole turn, not its thinking: under "Thought for"
                          it sat over the thinking section's own, smaller
                          "Thought for", and read as the same thing twice.
                        */}
                        {tf('Answered in {time}', { time: thinkingTime(message.spend.millis) })}
                        <img
                          className={thoughtOpen ? styles.thoughtChevronOpen : styles.thoughtChevron}
                          src={chevronDown12Icon}
                          alt=""
                          width={10}
                          height={10}
                        />
                      </button>
                    )}
                    {thoughtOpen && message.spend !== undefined && index === messages.length - 1 && (
                      <p className={styles.thoughtDetail}>
                        {spend === null ? (
                          <>
                            The provider took {message.spend!.millis} ms to answer. Nothing else is
                            recorded: the history keeps what was said, not how it was arrived at.
                          </>
                        ) : (
                          <>
                            The provider took {message.spend!.millis} ms to answer, and charged for{' '}
                            {tokenCount(message.spend!.inputTokens)} tokens in and{' '}
                            {tokenCount(message.spend!.outputTokens)} out - every round of this turn, so
                            a lookup an agent made on the way is counted here too.{' '}
                            {message.spend!.cost === null
                              ? t('This model carries no prices, so there is nothing to cost that at.')
                              : `At the prices recorded for it that is ${costAmount(message.spend!.cost)}.`}{' '}
                            {/*
                              This used to say none of it was kept, which was
                              true of every one of these numbers until the chat
                              began keeping a total. The breakdown still is not
                              kept - it belongs to a turn, and a turn is over -
                              and the line under the box below is.
                            */}
                            Only the chat's total is kept, on the line below.
                          </>
                        )}
                      </p>
                    )}
                    {/*
                      What this answer thought and what it looked up, above the
                      answer and outside it.

                      Outside is the whole point. The copy control below copies
                      `shownTake`, the speech model is handed `shownTake`, and
                      the next turn sends the thread — none of which holds any
                      of this, so none of them has to remember to leave it out.
                      A reasoning model's thinking read aloud is the bug this
                      replaces, not a risk it introduces.

                      On the answer being written and the one just written, and
                      nowhere else: nothing is recorded, so an answer further up
                      the log has none and would draw an empty container
                      claiming otherwise. The calls are the exception and they
                      come back on their own, off the session, as `tool` lines
                      in the log above.
                    */}
                    {(() => {
                      /*
                        The thinking on this message, live or kept.

                        Live for the answer being written now - the pieces
                        arrive frame by frame and are drawn as they land, which
                        is most of the point of showing thinking at all. Kept
                        for every other message, read back off the server, so an
                        answer three turns up still carries the reasoning that
                        produced it. Reloading the page loses nothing, which is
                        what it used to do.
                      */
                      const live = index === messages.length - 1 && sending;
                      const calls = index === messages.length - 1 ? working.calls : [];
                      // Where the calls are drawn, the section above them holds only the thinking before the first.
                      const thinking = calls.length > 0 ? working.opening : live ? working.thinking : (message.thinking ?? '');
                      /*
                        Summarising is drawn here rather than beside the composer
                        because it is part of this turn's working: it happens
                        after Send and before a single token of the answer, and
                        it is the reason for the silence.
                      */
                      const compacting = live && working.compacting;
                      /*
                        "Writing the answer…" stops once the answer is showing:
                        it counts what the reader cannot see yet, and nothing
                        clears it while the turn runs on, so it stayed beside
                        the text it described, its count frozen at the first
                        frame. A tool being spelled out still says so.
                      */
                      const answering = working.writing !== null && working.writing.tool === null && working.writing.promptTotal == null;
                      const writing = live && !(answering && message.content.trim() !== '') ? working.writing : null;
                      if (thinking.trim() === '' && calls.length === 0 && !compacting && writing === null) return null;
                      return (
                        <div className={styles.working}>
                          {compacting && (
                            <p className={styles.compacting}>
                              {t('Summarising the earlier part of this conversation…')}
                            </p>
                          )}
                          <Thinking
                            text={thinking}
                            /* Over once anything follows it: it went on blinking beside the calls for the whole turn. */
                            live={live && calls.length === 0}
                            /* Above the calls it is the first round only, so its own time and not the whole turn's. */
                            millis={calls.length > 0 ? working.openingMillis : live ? null : message.thinkingMillis}
                          />
                          {(() => {
                            const cards = (placed: InteractionRequest[] | undefined) =>
                              (placed ?? []).map((request) => (
                                <div key={`request-${request.id}`} className={styles.requestInTurn} data-request-in-turn="">
                                  <InteractionCard request={request} onAnswered={answeredRequest} />
                                </div>
                              ));
                            return (
                              <>
                          {calls.map((call) => (
                            <Fragment key={call.at}>
                            {cards(requestsAtCall.get(call.at))}
                            {call.person !== undefined ? (
                              <div key={call.at} className={styles.personInTurn} data-person-in-turn="">
                                <div className={styles.personInTurnText}>{call.person}</div>
                                {/* Queued until the agent's next step takes it in: a model reading a long prompt can take minutes to get there. */}
                                <span className={styles.personInTurnNote} data-person-read={call.personRead === true ? 'true' : 'false'}>
                                  {call.personRead === true
                                    ? t('Read by the agent')
                                    : t('Queued - the agent reads it at its next step')}
                                </span>
                              </div>
                            ) : call.thought !== undefined ? (
                              /* A round that thought nothing has no line. */
                              call.thought.trim() === '' ? null : (
                              <div key={call.at} data-thought="">
                                <Thinking
                                  text={call.thought}
                                  live={live && call === calls[calls.length - 1] && call.thoughtMillis === undefined}
                                  millis={call.thoughtMillis ?? null}
                                />
                              </div>
                              )
                            ) : call.said !== undefined ? (
                              <div key={call.at} className={styles.said} data-said="">
                                <Markdown>{call.said}</Markdown>
                              </div>
                            ) : call.drew !== undefined ? (
                              <div key={call.at} data-drew-in-turn="">
                                <Markdown pictureLinks zoomImages>{call.drew}</Markdown>
                              </div>
                            ) : (
                            <CallLine
                              key={call.at}
                              actor={call.tool}
                              content={call.arguments}
                              result={call.result}
                              failed={call.failed}
                              link={call.link}
                              when={calledAt(call.seenAt)}
                              /*
                                One line until asked, which is the chat's
                                answer and not the component's. A lookup in the
                                middle of a conversation is an aside; a task's
                                page, where watching the calls is the feature,
                                passes nothing and gets them open.
                              */
                              folded
                            />
                            )}
                            </Fragment>
                          ))}
                          {/* Only where the turn's calls are drawn: an older answer's working has none, and is not this turn. */}
                          {calls.length > 0 && cards(requestsAtTurnEnd)}
                              </>
                            );
                          })()}
                          {writing !== null && (
                            <p className={styles.writingNow} data-chat-writing="">
                              {readingShare(writing) !== null ? (
                                /* What is happening and how far, on one line; the counts under it. */
                                <span className={styles.readingCard}>
                                  <span className={styles.readingTop}>
                                    <span className={styles.readingLead} data-reading-lead="">{writingParts(writing).lead}</span>
                                    <span className={styles.readingShare} data-reading-share="">{readingShare(writing)}%</span>
                                  </span>
                                  <span className={styles.readingDetails} data-reading-details="">{writingParts(writing).rest.trim()}</span>
                                </span>
                              ) : (
                                <span className={styles.compacting}>{writingParts(writing).rest}</span>
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {/* Models write markdown; showing the source shows the asterisks. */}
                    {/*
                      Zooming on, because a picture drawn in a chat is drawn at
                      the width of the column and there is nowhere else to see
                      it whole: clicking it did nothing, which reads as a
                      picture rather than a control. The docs and a task's
                      outcome have said `zoomImages` all along; this is the one
                      place a picture is actually *made*.
                    */}
                    {(requestsInAnswer.get(index) ?? []).map((request) => (
                      <div key={`request-${request.id}`} className={styles.requestInTurn} data-request-in-answer="">
                        <InteractionCard request={request} onAnswered={answeredRequest} />
                      </div>
                    ))}
                    {(picturesFor.get(index) ?? [])
                      // Already drawn among this turn's calls, where it was drawn.
                      .filter((picture) => index !== messages.length - 1 || !drawnInTurn.has(picture))
                      .map((picture, at) => (
                      <Markdown key={`picture-${at}`} pictureLinks zoomImages>{picture}</Markdown>
                    ))}
                    <Markdown pictureLinks zoomImages runnable={runOffer}>{shownTake(index, message)}</Markdown>
                    {filesOf(filesUnder(message), 'assistant')}
                    {index === messages.length - 1 && replyChips !== null && (
                      <div className={styles.replySuggestions} role="group" aria-label={t('Suggested replies')} data-testid="chat-reply-suggestions">
                        {replyChips.map((line) => (
                          <button
                            key={line}
                            type="button"
                            className={styles.replySuggestion}
                            title={line}
                            data-testid="chat-reply-suggestion"
                            onClick={(event) => void handleSend(event as unknown as FormEvent, line)}
                          >
                            {line}
                          </button>
                        ))}
                      </div>
                    )}
                    {/*
                      Which take of this answer is being read, and the way back
                      to the others.

                      Outside the row of actions below on purpose: those appear
                      under the pointer, which is right for a copy button and
                      wrong for this. That an answer was given twice is a fact
                      about the conversation, and one nobody would find by
                      hovering over a paragraph they had no reason to suspect.
                    */}
                    {message.takes.length > 0 && (
                      <span className={styles.takes}>
                        <button
                          type="button"
                          className={styles.rowAction}
                          onClick={() => stepTake(index, message, -1)}
                          disabled={takeShowing(index, message) === 0}
                          title={t('The answer before this one')}
                          aria-label={t('The answer before this one')}
                        >
                          <img
                            src={chevronDown12Icon}
                            alt=""
                            width={12}
                            height={12}
                            style={{ transform: 'rotate(90deg)' }}
                          />
                        </button>
                        {/*
                          No `role="status"`: this is drawn for as long as the
                          answer has more than one take, and the loading mark
                          the checks wait on is exactly that role. A label that
                          never goes away would read as a page that never
                          finishes loading.
                        */}
                        <span className={styles.takeCount}>
                          {takeShowing(index, message) + 1} of {message.takes.length + 1}
                        </span>
                        <button
                          type="button"
                          className={styles.rowAction}
                          onClick={() => stepTake(index, message, 1)}
                          disabled={takeShowing(index, message) === message.takes.length}
                          title={t('The answer after this one')}
                          aria-label={t('The answer after this one')}
                        >
                          <img
                            src={chevronDown12Icon}
                            alt=""
                            width={12}
                            height={12}
                            style={{ transform: 'rotate(-90deg)' }}
                          />
                        </button>
                      </span>
                    )}
                    {isTurnAnswer(index) && (
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.rowAction}
                        onClick={() => void copy(shownTake(index, message), index)}
                        title={t('Copy')}
                        aria-label={t('Copy this answer')}
                      >
                        <img src={copyIcon} alt="" width={14} height={14} />
                      </button>
                      {/*
                        Asking for it again, on the answer the chat ends on.

                        Only there: anything earlier has been answered on top
                        of, and a different answer under a question three turns
                        back would rewrite what those turns were replying to.
                        Not on a turn carried in from a session either — those
                        are somebody else's words, copied in, and this chat has
                        no business answering them again.
                      */}
                      {index === messages.length - 1 &&
                        message.actor === null &&
                        !sending &&
                        message.content.trim() !== '' && (
                          <button
                            type="button"
                            className={styles.rowAction}
                            onClick={() => void handleRegenerate()}
                            title={t('Answer again — this one is kept')}
                            aria-label={t('Answer again')}
                          >
                            <img src={refreshCwIcon} alt="" width={14} height={14} />
                          </button>
                        )}
                      {/*
                        Only where a speech model is set. A speaker that always
                        appeared and always failed would be worse than none.
                      */}
                      {reads && shownTake(index, message).trim() !== '' && (
                        <button
                          type="button"
                          className={
                            speaking === index ? `${styles.rowAction} ${styles.rowActionOn}` : styles.rowAction
                          }
                          onClick={() => readAnswer(index, shownTake(index, message))}
                          aria-pressed={speaking === index}
                          title={
                            fetchingSpeech === index
                              ? t('Reading it…')
                              : speaking === index
                                ? 'Stop'
                                : t('Read this answer aloud')
                          }
                          aria-label={speaking === index ? t('Stop reading') : t('Read this answer aloud')}
                        >
                          <img src={volume2Icon} alt="" width={14} height={14} />
                        </button>
                      )}
                      {fetchingSpeech === index && <span className={styles.copied}>Reading…</span>}
                      {speaking === index && speechHeard !== null && (
                        <span
                          className={styles.readProgress}
                          role="progressbar"
                          aria-label={t('Read aloud so far')}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(speechHeard * 100)}
                          data-read-progress=""
                        >
                          <span className={styles.readTrack}>
                            <span className={styles.readFill} style={{ width: `${Math.round(speechHeard * 100)}%` }} />
                          </span>
                          {Math.round(speechHeard * 100)}%
                        </span>
                      )}
                      {copySaid(index)}
                    </div>
                    )}
                  </div>
                </div>
              )}
              {/*
                Where the session's record stops and this conversation starts.

                The names above it already say the turns came from somewhere
                else, but a reader working out what went wrong is asking a
                different question - which of this was already there, and which
                of it is theirs - and one line answers it at a glance.
              */}

              </Fragment>
            ))}
            {(placedReviews.get(messages.length) ?? []).map(({ review, taken }) => (
                <ReviewLine key={`review-${review.id}-${taken}`} review={review} taken={taken} />
              ))}
            {(placedRequests.get(messages.length) ?? []).map((request) => (
              <div key={`request-${request.id}`} className={styles.requestRow}>
                <InteractionCard request={request} onAnswered={answeredRequest} />
              </div>
            ))}

            {/*
              Only until the model actually starts. The answer streams into an
              assistant turn that begins empty, so an empty last message is the
              wait itself — once a token lands there is something to read, and
              saying "Waiting" over the top of it is just wrong. The same is now
              true of an agent, which produces no token until the very end but
              does produce lookups on the way: once one of those is drawn, the
              wait has visibly stopped being a wait.
            */}
            {/* A row of its own only where the empty answer draws none; otherwise the wait is said inside that answer's row. */}
            {waitingNow && carried.has(messages.length - 1) && (
              <div className={styles.assistantRow}>
                <span className={styles.assistantAvatar} aria-hidden="true">
                  <img src={cpuIcon} alt="" width={16} height={16} />
                </span>
                {waitingLine}
              </div>
            )}
            {/* A question still waiting for an answer is the last thing in the chat, so it cannot be scrolled past. */}
            {openRequests.map((request) => (
              <div key={`request-${request.id}`} className={styles.requestRow} data-request-open-bottom="">
                <InteractionCard request={request} onAnswered={answeredRequest} />
              </div>
            ))}
          </div>

          {errorBanner}
          {passingBanner}

          {spent !== null && (
            <p className={styles.spent} title={t('What this chat has read and written, all of it')}>
              {spent}
            </p>
          )}
          {/* What the agent keeps live in this chat - timers, stopwatches - just above where the person writes. */}
          <ChatWidgets
            widgets={widgets}
            soundByDefault={timerSound}
            onAct={(widget, action) =>
              void actOnChatWidget(widget.id, action)
                .then((after) => setWidgets((held) => held.map((one) => (one.id === after.id ? after : one))))
                .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not change that widget.')))
            }
            onRemove={(widget) =>
              void removeChatWidget(widget.id)
                .then(() => setWidgets((held) => held.filter((one) => one.id !== widget.id)))
                .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t('Could not remove that widget.')))
            }
          />
          <form ref={composerForm} className={styles.composer} onSubmit={handleSend}>
            {/* What is going with the message, above the box it is going from. */}
            {attached.length > 0 && (
              <div className={styles.attachments}>
                {attached.map((file) => (
                  <span key={file.id} className={styles.attachment}>
                    {isShowable(file.contentType) && (
                      <button
                        type="button"
                        className={styles.thumbButton}
                        onClick={() => setPreviewId(file.id)}
                        title={`Open ${file.filename}`}
                      >
                        <img className={styles.thumbSmall} src={attachmentUrl(file.id)} alt="" />
                      </button>
                    )}
                    {isShowable(file.contentType) ? (
                      <button
                        type="button"
                        className={styles.attachmentName}
                        onClick={() => setPreviewId(file.id)}
                        title={`Open ${file.filename}`}
                      >
                        {file.filename}
                      </button>
                    ) : (
                      <a
                        className={styles.attachmentName}
                        href={attachmentUrl(file.id)}
                        download={file.filename}
                        title={`Download ${file.filename}`}
                      >
                        {file.filename}
                      </a>
                    )}
                    <span className={styles.attachmentSize}>{formatSize(file.sizeBytes)}</span>
                    <button
                      type="button"
                      className={styles.attachmentRemove}
                      onClick={() => setAttached((current) => current.filter((held) => held.id !== file.id))}
                      aria-label={`Remove ${file.filename}`}
                      title={t('Remove')}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/*
              The whole box is the text field, as far as a pointer is
              concerned.
              
              It looks like one control and is several: a 20px textarea beside
              taller buttons, inside 16px of padding. Everything that is not the
              one line of text - the padding, and the gap left beside the
              buttons - was dead, so clicking what plainly reads as the input
              did nothing.
              
              `mousedown` rather than `click`, and only when the press landed on
              the box itself: a press on a child is that child's, and focus has
              to be taken before the default action moves it somewhere else.
            */}
            <div
              className={styles.composerBox}
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                document.getElementById('chat-composer')?.focus();
              }}
            >
              {/*
                One button, one menu, and for now one thing in it. A dropdown
                rather than a paperclip because what can be added to a message
                is going to grow, and a row of icons is how that goes wrong.
              */}
              {(attachmentsAllowed || reviewable) && (
                <div className={styles.addWrapper} ref={addRef}>
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={() => setAddOpen((open) => !open)}
                    disabled={attaching}
                    aria-haspopup="menu"
                    aria-expanded={addOpen}
                    aria-label={t('Add to this message')}
                    title={attaching ? t('Uploading…') : t('Add to this message')}
                  >
                    +
                  </button>
                  {addOpen && (
                    <div className={styles.addMenu} role="menu">
                      {attachmentsAllowed && (
                        <button
                          type="button"
                          className={styles.addMenuItem}
                          role="menuitem"
                          onClick={() => {
                            setAddOpen(false);
                            filesRef.current?.click();
                          }}
                        >
                          {t('Upload files')}
                        </button>
                      )}
                      {/* A review of this chat, sent by the person without asking the agent. */}
                      {reviewable && current !== null && (
                        <button
                          type="button"
                          className={styles.addMenuItem}
                          role="menuitem"
                          onClick={() => {
                            setAddOpen(false);
                            setReviewing(current.id);
                          }}
                        >
                          {t('Send a review')}
                        </button>
                      )}
                    </div>
                  )}
                  <input
                    ref={filesRef}
                    className={styles.hiddenAnchor}
                    type="file"
                    multiple
                    onChange={(event) => void handleFiles(event.target.files)}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                </div>
              )}
              {/*
                What can be typed instead of said, opened by a slash at the
                start of the box. Issue #343.

                Above the box rather than below it: the box sits at the bottom
                of the window, and a menu under it would be off the screen.
              */}
              {offered.length > 0 && (
                <div className={styles.commandMenu} role="listbox" aria-label={t('Commands')}>
                  <button
                    type="button"
                    className={styles.commandClose}
                    aria-label={t('Close suggestions')}
                    title={t('Close suggestions')}
                    data-close-suggestions=""
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setCommandAt(-1);
                      setCommandsShut(true);
                      composerRef.current?.focus();
                    }}
                  >
                    ×
                  </button>
                  {offered.map((one, index) => (
                    <button
                      key={one.name}
                      type="button"
                      role="option"
                      aria-selected={one.name === chosen?.name}
                      className={one.name === chosen?.name ? styles.commandOn : styles.command}
                      onMouseEnter={() => setCommandAt(index)}
                      // Down rather than click: the box loses focus first
                      // otherwise, and the menu is gone before the click lands.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setDraft(`/${one.name}${one.argument === null ? '' : ' '}`);
                        setCommandAt(-1);
                        composerRef.current?.focus();
                      }}
                    >
                      <span className={styles.commandName}>/{one.name}</span>
                      <span className={styles.commandSummary}>{one.summary}</span>
                      {one.argument !== null && (
                        <span className={styles.commandArgument}>{one.argument}</span>
                      )}
                      {/*
                        What is worth knowing before pressing rather than after:
                        /workflow really runs it, and if the workflow messages
                        somebody it messages them.
                      */}
                      {one.warning !== null && <span className={styles.commandWarning}>{one.warning}</span>}
                    </button>
                  ))}
                </div>
              )}
              {/*
                The skills a word starting with the workspace's command marker
                can name, drawn as the slash menu is so the two read as one.
              */}
              {skillsOffered.length > 0 && (
                <div className={styles.commandMenu} role="listbox" aria-label={t('Skills')}>
                  <button
                    type="button"
                    className={styles.commandClose}
                    aria-label={t('Close suggestions')}
                    title={t('Close suggestions')}
                    data-close-suggestions=""
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setSkillAt(-1);
                      setCommandsShut(true);
                      composerRef.current?.focus();
                    }}
                  >
                    ×
                  </button>
                  {skillsOffered.map((one, index) => (
                    <button
                      key={one.key}
                      type="button"
                      role="option"
                      aria-selected={one.key === skillChosen?.key}
                      className={one.key === skillChosen?.key ? styles.commandOn : styles.command}
                      onMouseEnter={() => setSkillAt(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        completeSkill(one);
                        composerRef.current?.focus();
                      }}
                    >
                      <span className={styles.commandName}>
                        {marker}
                        {one.key}
                      </span>
                      <span className={styles.commandSummary}>{one.name}</span>
                      {one.description !== null && <span className={styles.commandDetail}>{one.description}</span>}
                    </button>
                  ))}
                </div>
              )}
              {ghost !== null && (
                <div ref={ghostRef} className={styles.composerGhost} aria-hidden="true" data-testid="chat-composer-ghost">
                  <span className={styles.composerGhostTyped}>{draft}</span>
                  <span className={styles.composerGhostWords} data-testid="chat-composer-suggestion">
                    {ghost}
                  </span>
                </div>
              )}
              <textarea
                id="chat-composer"
                ref={composerRef}
                className={styles.composerInput}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setCaret(event.target.selectionStart);
                  setSkillAt(-1);
                  // Typing is somebody starting again, so a menu put away for
                  // the last line does not stay away for this one.
                  setCommandsShut(false);
                }}
                onKeyDown={handleComposerKey}
                /*
                  A pasted picture is attached the way an uploaded one is. Text
                  is left to the box: only a paste that carries files and no
                  text is taken over, so copying a cell from a spreadsheet -
                  which carries both - still pastes the words.
                */
                onPaste={(event) => {
                  if (!attachmentsAllowed) return;
                  const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
                  if (pasted.length === 0 || event.clipboardData.getData('text/plain') !== '') return;
                  event.preventDefault();
                  void handleFiles(pasted);
                }}
                onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
                placeholder={t('Type a message...')}
                rows={1}
                aria-label={t('Message')}
              />
              {/*
                Speech goes into the box, not out to the model: what was heard
                is a draft like any other, and a mishearing is fixed before
                anybody else reads it.
              */}
              {/*
                There was a picture button here, and asking for a picture is now
                something said in the conversation. #294 gave a chat agent
                `chat_draw_picture`, so "draw me the architecture we just
                discussed" is a sentence rather than a mode the composer is
                switched into and the description retyped in. The workspace's
                image model still decides whether it can be done at all; it now
                decides whether the *agent* is offered the tool.
              */}
              {/*
                The chat's own settings, a pair in this order: how hard the model
                thinks (#654, drawn only where the model takes it), then how the
                agent works (#653, only an agent has tools to hold back). Both
                come before the microphone and voice mode, which are about
                speaking rather than about how the answer is made.
                chat-effort-check measures the order and the gaps.
              */}
              {current !== null && (
                <ChatEffort chatId={current.id} answeredBy={`${current.agentId ?? ''}:${current.modelId ?? ''}`} />
              )}
              {current.agentId !== null && (
                <ChatModeSwitch
                  chat={current}
                  onChanged={(fresh) =>
                    setSessions((held) => held?.map((one) => (one.id === fresh.id ? { ...one, mode: fresh.mode } : one)) ?? held)
                  }
                />
              )}
              {/* What the microphone is hearing, while it hears it. */}
              {listening !== null && <VoiceMeter stream={listening} />}
              {hears && (
                <button
                  type="button"
                  className={recording ? `${styles.micButton} ${styles.micRecording}` : styles.micButton}
                  onClick={() => void handleMicrophone()}
                  disabled={transcribing}
                  aria-pressed={recording}
                  aria-label={recording ? t('Stop recording') : t('Record a message')}
                  title={
                    transcribing
                      ? t('Transcribing…')
                      : recording
                        ? t('Stop and transcribe')
                        : t('Record a message')
                  }
                >
                  <img src={micIcon} alt="" width={16} height={16} />
                </button>
              )}
              {/*
                Voice mode is always on the bar: it is too much of the product
                to vanish where a model is missing, and a button that is simply
                not there reads as a product without voice. Where it cannot
                start it is drawn off, and its note says which model is missing
                and where it is chosen.
              */}
              {voiceKnown && !voiceHidden && !(hears && reads) && (
                <span
                  className={styles.voiceUnavailable}
                  onMouseEnter={() => {
                    if (voiceWhyClosing.current !== null) window.clearTimeout(voiceWhyClosing.current);
                    setVoiceWhy(true);
                  }}
                  // A moment's grace, so a pointer that slips off the edge on its way to the link can come back.
                  onMouseLeave={() => {
                    voiceWhyClosing.current = window.setTimeout(() => setVoiceWhy(false), 300);
                  }}
                  onFocus={() => setVoiceWhy(true)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVoiceWhy(false);
                  }}
                >
                  <button
                    type="button"
                    className={`${styles.voiceButton} ${styles.voiceButtonOff}`}
                    aria-disabled="true"
                    aria-label={t('Voice mode is not available')}
                    aria-describedby="voice-why"
                    data-testid="voice-unavailable"
                    onClick={() => setVoiceWhy((open) => !open)}
                  >
                    <img src={audioLinesIcon} alt="" width={16} height={16} data-keeps-colour />
                  </button>
                  {voiceWhy && (
                    <span className={styles.voiceWhy} role="tooltip" id="voice-why">
                      {!hears && !reads
                        ? t('Voice mode needs a transcription model and a speech model, and this workspace has neither.')
                        : !hears
                          ? t('Voice mode needs a transcription model to hear you, and this workspace has none.')
                          : t('Voice mode needs a speech model to answer aloud, and this workspace has none.')}{' '}
                      {cachedWorkspaces()?.find((one) => one.id === workspaceId)?.administered === true ? (
                        <Link to={`/workspace/${workspaceId}/settings#${hears ? 'speech-model' : 'transcription-model'}`}>
                          {t('Choose one in workspace settings')}
                        </Link>
                      ) : (
                        t('A workspace admin chooses them in workspace settings.')
                      )}
                    </span>
                  )}
                </span>
              )}
              {!voiceHidden && hears && reads && (
                <>
                  {/*
                    Voice mode, next to the microphone it is easily confused
                    with: the microphone dictates into the box, this one hands
                    the conversation over to speech entirely. The waveform in a
                    filled circle is how that control is drawn everywhere else,
                    and it used to be a loudspeaker off in the title bar, which
                    said "read this aloud" from a place nobody looked.

                    One control, three states, and it does something different
                    in each: entering when it is off, cutting the answer short
                    while it is talking, and ending a turn early while it is
                    listening. Leaving is the X beside it - having the same
                    button both interrupt and leave meant one of those happening
                    when the other was meant.
                  */}
                  <button
                    type="button"
                    className={
                      voice
                        ? `${styles.voiceButton} ${styles.voiceButtonOn} ${styles[`voice${voicePhase}`]}`
                        : styles.voiceButton
                    }
                    onClick={() => (voice ? voiceControls.current?.interrupt() : setVoice(true))}
                    aria-pressed={voice}
                    title={
                      !voice
                        ? t('Talk instead of typing')
                        : voicePhase === 'speaking'
                          ? t('Speaking - press to cut in')
                          : voicePhase === 'thinking'
                            ? 'Thinking'
                            : t('Listening - press when you have finished')
                    }
                    aria-label={
                      !voice
                        ? t('Enter voice mode')
                        : voicePhase === 'speaking'
                          ? t('Stop speaking and listen')
                          : voicePhase === 'thinking'
                            ? 'Thinking'
                            : t('Finish speaking')
                    }
                  >
                    {voice && voicePhase === 'thinking' ? (
                      // Three dots rather than an icon: there is nothing to
                      // hear and nothing to say, and a still icon reads as
                      // stuck rather than working.
                      <span className={styles.voiceDots} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      /*
                        The button draws these white, because the circle under
                        them is brand green in either theme. That is why they
                        opt out of the rule darkening icons for the light theme:
                        a glyph darkened for a white page vanishes into green.
                      */
                      <img
                        src={voice && voicePhase === 'speaking' ? volume2Icon : audioLinesIcon}
                        alt=""
                        width={16}
                        height={16}
                        data-keeps-colour
                      />
                    )}
                  </button>
                  {voice && (
                    <button
                      type="button"
                      /*
                        The same control the microphone is, not a bare glyph:
                        it sits in a row with two drawn buttons, and an
                        undrawn one between them reads as something that fell
                        in rather than something you press.
                      */
                      className={styles.micButton}
                      onClick={() => setVoice(false)}
                      title={t('Leave voice mode')}
                      aria-label={t('Leave voice mode')}
                    >
                      <img src={xIcon} alt="" width={16} height={16} />
                    </button>
                  )}
                </>
              )}
              {/*
                Offered only while there is a turn to stop, and only where this
                composer is the thing that started it: in voice mode the circle
                beside this is the control that cuts in, and a second one here
                would be two buttons with one job disagreeing about what a turn
                is.
              */}
              {sending && !voice && (
                <button
                  type="button"
                  className={styles.stopButton}
                  onClick={handleStop}
                  title={t('Stop this answer')}
                >
                  {t('Stop')}
                </button>
              )}
              <button
                type="submit"
                className={styles.sendButton}
                disabled={(draft.trim() === '' && attached.length === 0) || (sending && !voice && current.agentId === null)}
              >
                {sendLabel}
              </button>
            </div>
          </form>
        </div>
        {voice && workspaceId !== null && (
          <VoiceMode
            ref={voiceControls}
            workspaceId={workspaceId}
            turnTaking={turnTaking}
            chunking={chunking}
            onSay={handleVoiceTurn}
            onAgain={handleVoiceAgain}
            onPhase={setVoicePhase}
            onClose={() => setVoice(false)}
          />
        )}
        </div>
      )}
      {/* The title bar's search focuses the sidebar's box, which is the one that filters. */}

      <ReviewDialog
        chatId={reviewing}
        onClose={() => setReviewing(null)}
        onSent={() => {
          setReviewing(null);
          loadReviews();
        }}
      />

      <ConfirmDialog
        subject={deleting?.title ?? null}
        kind="deleteChat"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <AttachmentViewer
        images={previewPictures}
        openId={previewId}
        onClose={() => setPreviewId(null)}
        onOpen={setPreviewId}
      />
    </AppShell>
  );
}

/** How long the unread count's pop lasts when it goes up. */
const UNREAD_POP_MS = 220;

function SessionRow({
  entry,
  current,
  looking = true,
  pinnedRow,
  naming = false,
  menuOpen,
  onSelect,
  onMenu,
  onPin,
  onRename,
  onDelete,
}: {
  entry: ChatSession;
  current: boolean;
  /** Whether the window is in front of somebody; the open chat counts as read only then. */
  looking?: boolean;
  pinnedRow?: boolean;
  /** Its title is being generated, which takes a moment after the first answer. */
  naming?: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onMenu: () => void;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  // The chat open on screen is being read, whatever the list last said.
  // The chat open on screen is being read - while somebody is looking at the window.
  const unread = current && looking ? 0 : entry.unreadCount;
  /*
   * A short pop when the count goes up, so news arriving in a long list is
   * seen - not when it first draws or goes down. Left out where motion is
   * not wanted.
   */
  const seen = useRef(unread);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    const before = seen.current;
    seen.current = unread;
    if (unread <= before) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    setPopping(true);
    const timer = window.setTimeout(() => setPopping(false), UNREAD_POP_MS);
    return () => window.clearTimeout(timer);
  }, [unread]);
  return (
    <div className={`${styles.sessionRow} ${current ? styles.sessionRowCurrent : ''}`}>
      <button type="button" className={styles.sessionButton} onClick={onSelect}>
        {/* No icon: the same speech bubble on every row said nothing. A pinned one keeps its dot, which does. */}
        {pinnedRow && <span className={styles.pinDot} aria-hidden="true" />}
        <span className={unread > 0 ? `${styles.sessionTitle} ${styles.sessionTitleUnread}` : styles.sessionTitle}>
          {entry.title}
        </span>
        {/* Turning while the chat's title is being generated, beside the name it is about to replace. */}
        {naming && <span className={styles.namingSpinner} role="status" aria-label={t('Naming this chat…')} data-testid="chat-row-naming" />}
        {unread > 0 && (
          <span
            key={unread}
            className={popping ? `${styles.unreadPill} ${styles.unreadPop}` : styles.unreadPill}
            data-testid="chat-unread"
            aria-label={tf('{count} unread', { count: unread })}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <button
        type="button"
        className={styles.sessionMenuButton}
        onClick={onMenu}
        aria-label={`Actions for ${entry.title}`}
        aria-expanded={menuOpen}
      >
        ⋮
      </button>

      {menuOpen && (
        <div className={styles.contextMenu} role="menu">
          <button type="button" role="menuitem" className={styles.menuItem} onClick={onPin}>
            {entry.pinned ? t('Unpin chat') : t('Pin chat')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={onRename}>
            {t('Rename chat')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItemDanger} onClick={onDelete}>
            {t('Delete chat')}
          </button>
        </div>
      )}
    </div>
  );
}

/** A review of this chat, where it was sent: a card with its stars, who sent it, and what they wrote. */
function ReviewLine({ review, taken }: { review: ChatReview; taken: boolean }) {
  // Where it was taken back: one line saying so, in the place it happened.
  if (taken) {
    return (
      <div className={styles.reviewRow}>
        <div className={`${styles.reviewCard} ${styles.reviewTaken}`} data-testid="chat-review-taken">
          {/* In the card's head, which is what sets the line's size: on its own it took the page's. */}
          <div className={styles.reviewHead}>
            <span className={styles.reviewWho}>
              {tf('{name} took back their review ({score} out of 5)', { name: review.personName ?? '', score: String(review.score) })}
            </span>
          </div>
        </div>
      </div>
    );
  }
  const withdrawn = review.withdrawnAt !== null;
  return (
    <div className={styles.reviewRow}>
      <div
        className={withdrawn ? `${styles.reviewCard} ${styles.reviewTaken}` : styles.reviewCard}
        data-testid="chat-review"
        data-score={review.score}
        data-withdrawn={withdrawn ? '' : undefined}
      >
        <div className={styles.reviewHead}>
          <span className={styles.reviewStars} role="img" aria-label={tf('{score} out of 5', { score: String(review.score) })}>
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={star <= review.score ? styles.starOn : styles.starOff}
                viewBox="0 0 24 24"
                width={16}
                height={16}
                aria-hidden="true"
              >
                <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
              </svg>
            ))}
          </span>
          <span className={styles.reviewWho}>
            {tf('{name} reviewed this chat', { name: review.personName ?? '' })}
            {withdrawn && ` · ${t('taken back')}`}
          </span>
        </div>
        {review.review !== null && <div className={styles.reviewWords} data-review-words="">{review.review}</div>}
      </div>
    </div>
  );
}
