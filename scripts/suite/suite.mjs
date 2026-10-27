/**
 * Which checks there are, and what each one needs before it can be believed.
 *
 * The list is here rather than a glob over the folder so that adding a file is
 * a decision: a script somebody wrote to measure something once should not
 * become a test in CI because it happened to be saved in this directory.
 *
 * `needs` is the honest part. Nearly every one of these drives the real
 * interface against a real server, and they differ in what has to be in that
 * server's database first:
 *
 *   'nothing'   - no server at all. A check that reads the source, or asks a
 *                 compiler about something the interface generates, and would
 *                 only be putting a browser between itself and the answer.
 *   'session'   - an account and nothing else. Runs anywhere the product runs.
 *   'workspace' - a workspace with the ordinary furniture: functions, tools,
 *                 conditions, connections, issues. The seed builds this.
 *   'workflow'  - a workflow with nodes and lines in it, opened in the editor.
 *   'fixture'   - something more particular than the two above; see the note.
 *   'model'     - a model that answers. CI has none, and neither does the
 *                 developer machine this was written on while its stored
 *                 secrets are unreadable. Never run unattended.
 *
 * `ci: false` means exactly one thing: this check is not run by the CI job. The
 * reason is written beside it, and it is never "it is flaky".
 *
 * `budget: <ms>` raises the runner's timeout for one check. The default is a
 * hang-catcher and sits near what the slowest healthy check takes, so a check
 * that is legitimately longer than that has to say so rather than have every
 * other check's hang-catcher loosened around it. One check asks, and the
 * reason is beside it.
 *
 * `alone: true` means this check changes something the whole installation
 * shares, so nothing may run beside it. Sharding hands each worker its own
 * workspace, which covers everything a check normally touches; it does not
 * cover a switch in Admin or the language on the account every worker signs in
 * as. Two checks are in that position and both say so.
 */
export const TESTS = [
  // --- the editor canvas -----------------------------------------------------
  {
    name: 'turn-check',
    what: 'the control that turns a node, and R still doing the same',
    needs: ['workflow'],
  },
  {
    name: 'condition-arguments-check',
    what: "a condition node fills in the parameters of the function it asks, with the ordinary controls",
    needs: ['workspace'],
    /*
     * Makes its own function, condition and workflow: the rows only exist for a
     * condition that asks a function that declares parameters, and no fixture
     * has one that would stay put.
     */
  },
  {
    name: 'page-reset-check',
    what: 'the page a list is on, and the workspace switch that used to keep it',
    needs: [],
    /*
     * `alone`, because it makes two workspaces and takes them away again, and
     * `workspace-selector-check` counts the installation's workspaces before
     * and after a reload to assert nothing came or went. Both are right; they
     * cannot be right at the same time.
     */
    alone: true,
  },
  {
    name: 'quick-chat-welcome-check',
    what: 'the quick chat opens on a greeting and questions to ask, under a button that says Ask AI',
    needs: ['workspace'],
  },
  {
    name: 'quick-chat-stop-check',
    what: 'stopping the quick chat mid-request, with the answer held open so no model decides the timing',
    needs: ['workspace'],
    /*
     * It sets the workspace's quick-chat model and puts it back, so it changes
     * something the installation shares - but only that one field, and only its
     * own; it does not need `alone`.
     */
  },
  {
    name: 'workflow-switch-check',
    what: 'switching a workflow off from the editor, which asks first, and back on, which does not',
    needs: ['workspace'],
  },
  {
    name: 'execution-retention-check',
    what: 'how long finished runs are kept: typed, saved, reloaded, and zero refused',
    needs: [],
    /*
     * Installation-wide, like the setting beside it: it needs no workspace and
     * puts back what it found. The sweep itself is a server test, where a clock
     * can be moved.
     */
  },
  {
    name: 'field-search-check',
    what: "the field picker's search, and that a group's heading does not keep its fields",
    needs: ['workflow'],
    /*
     * It reads the groups off the open list and picks its own needle out of a
     * heading, so it does not care what the fixture's nodes are called - which
     * is the point: the bug was that a heading matched and kept everything
     * under it, and that shape exists in any graph.
     */
  },
  {
    name: 'field-picker-keys-check',
    what: 'the field picker from the keyboard: arrows, Home and End, Enter to pick, Escape to close (#582)',
    needs: ['workflow'],
    /*
     * The picker is one component behind three screens, and the editor is the
     * one the fixture always has. It picks its own few letters off the open
     * list, and changes the side panel without saving it.
     */
  },
  {
    name: 'bend-check',
    what: "a line's points moving it exactly as far as they were dragged, bare and labelled",
    needs: ['workspace'],
    /*
     * It was held back on the fixture rather than on the behaviour: it took
     * whichever line the seeded workflow had most of in the open, which was
     * never reliably a line it could get a handle on. It builds its own graph
     * now - two agents passing a field, two passing none - so it runs anywhere
     * there is an agent to point four nodes at, and removes it afterwards.
     *
     * Both lines matter. Every line on the seeded workflow carries fields, so
     * the labelled one was the only kind ever driven, and the bug that turned
     * up was in the other direction: a labelled line would not take a second
     * bend, because its label lay over the middle of it and answered the
     * double-click that adds a point by taking its own point off. The whole
     * battery now runs twice, once against each kind.
     */
  },
  {
    name: 'editor-graph-check',
    what: 'the editor keeps its graph on the canvas, including across a Discard',
    needs: ['workflow'],
    /*
     * Issue #242, which is #235 on the other page that mounts a canvas. React
     * Flow draws a node it has no measurement for as invisible and drops every
     * measurement whenever the node objects are replaced, and when the
     * replacement lands in the same batch as a measurement the nodes stay hidden
     * until the page is reloaded.
     *
     * The editor is exposed in one place rather than everywhere: its nodes carry
     * `measured` back from React Flow, so every rebuild that spreads what is
     * already there hands the measurement back, and only `loadGraph` - opening
     * the editor, and Discard - builds the objects fresh. So Discard is what is
     * driven, watched every animation frame, because before the fix it blanked
     * all four nodes for exactly one frame on every press.
     *
     * The other half is that these nodes are resizable. One is dragged wider and
     * taller and has to keep the size it was dragged to: a fix that tells React
     * Flow how big an unmeasured node is must not pin a node somebody sized by
     * hand to the minimum.
     */
  },
  {
    name: 'panel-close-check',
    what: 'the × on the builder panel: where it is, that it stays there, and that Escape does it too',
    needs: ['workflow'],
    /*
     * Open definition opens a component down the left of the editor, and the
     * only way out was the Cancel at the foot of a form three screens long.
     * A panel is not a modal - it is opened with `show()`, so it gets neither a
     * backdrop nor an Escape from the browser - which is why both had to be
     * built rather than turned on.
     *
     * The measurement that earns this a place: the panel is scrolled to its end
     * and the × is measured again. A close control that scrolls away with the
     * first field is the same bug spelled differently, and it is invisible in a
     * screenshot of an unscrolled panel.
     */
  },
  {
    name: 'publish-shortcut-check',
    what: 'publishing a workflow from the keyboard, and the Publish control saying which keys',
    needs: ['workspace'],
    /*
     * Issue #233. Builds a one-node workflow of its own and removes it, so no
     * workflow anybody else's check reads is published by running this - and
     * the name carries a timestamp, because removing a workflow keeps its
     * definition and the name with it.
     *
     * Publishes are counted off the wire. A badge reading Published cannot tell
     * one publish from two, and one of the assertions is about exactly that.
     */
  },
  {
    name: 'editor-check',
    what: 'typing in a field name keeps focus, and does not delete the node behind it',
    needs: ['workflow'],
    /*
     * Was held back for waiting on a button called `Object` that nothing draws
     * any more. Nothing was wrong with the editor: issue 127 collapsed the six
     * Add buttons in the toolbar - Trigger, LLM Agent, Action, Condition,
     * Object, LLM Session - into one plus that opens a menu, and all six names
     * are still there one press further in. The check opens the menu, and both
     * bugs it was written for are being watched again.
     */
  },
  {
    name: 'agent-retry-check',
    what: 'an agent node has retries, a failure switch and a second handle',
    needs: ['workflow'],
  },
  {
    name: 'backoff-check',
    what: 'the doubling wait survives a save and a reload',
    needs: ['workflow'],
  },
  {
    name: 'editor-export-check',
    what: 'exporting the workflow on screen, at both depths, and what the file holds',
    needs: ['workflow'],
  },
  {
    name: 'flow-arrow-check',
    what: 'every line points in its own colour; the dash and the arrow tell a dependency from a step',
    needs: ['workspace'],
    /*
     * Issue #200. It builds its own graph - a flow line, a failure line and an
     * unwired node whose field is read, which is what draws the dashed one -
     * and removes it again, so it needs an agent to point four nodes at and
     * nothing else.
     *
     * It follows the `marker-end` to the `<marker>` it names rather than
     * stopping at "the attribute is set": a URL pointing at a definition
     * nothing rendered draws no arrow, and reads exactly like a fix that
     * landed. `marker-start` is read for the other half of the claim, since an
     * arrow at both ends says nothing about which way the run goes.
     */
  },
  {
    name: 'heading-alignment-check',
    what: "a sortable heading starts where its column's cells start",
    needs: [],
    /*
     * The Roles table drew NAME centred over left-aligned names: a column whose
     * cells stack two lines is a flex column, and the heading wearing its class
     * was centred across the width by it. Measured on the admin tables whose
     * first column stacks.
     */
  },
  {
    name: 'workspace-sharing-check',
    what: "one workspace lends another a variable catalog from its Sharing card; the other's agent is offered it, grants it, and loses it when the share stops",
    needs: [],
  },
  {
    name: 'session-ratings-check',
    what: "Admin > Reports: a picker between the reports, no switch on Ratings but a line saying which of Admin Settings' two is off, and a review sent from a chat drawn on the report",
    needs: [],
  },
  {
    name: 'usage-report-check',
    what: "Admin > Reports: usage tracking is switched in Admin Settings, the report says when it is off and links there, and draws people and their sessions",
    needs: [],
    /*
     * The switch is the whole of what is recorded, so it is pressed in Admin
     * Settings, reloaded, followed from the report's line and put back. The table half runs where the period holds anything; an
     * empty one has to say so rather than draw an empty table.
     */
  },
  {
    name: 'usage-chart-check',
    what: 'Admin > Reports: the chart draws every day on one scale, tokens stacked by kind, and cost as a measure of its own',
    needs: [],
    /*
     * Measured off the marks against usageSeries: each day's stack as tall as
     * its total, the cached part between the uncached input and the output,
     * a tooltip for the day under the pointer. An empty period draws none.
     */
  },
  {
    name: 'auto-refresh-steady-check',
    what: 'a list that refreshes itself does not move while it does',
    needs: ['workspace'],
    /*
     * The audit logs and the triggers list drew a spinner line above the rows
     * on every reload, so with auto-refresh on the table jumped once a second.
     * The reload is held for long enough to be seen, and the first row's top
     * is sampled through it.
     */
  },
  {
    name: 'workspace-members-check',
    what: "workspace settings list the members, and a member is made a workspace admin from a picker and put back",
    needs: ['workspace'],
    /*
     * Driven as an installation administrator, listed fixed. The server is
     * asked after each change whether it agrees; the picker's colour is not
     * evidence of a save.
     */
  },
  {
    name: 'settings-menu-check',
    what: 'the two long settings pages have their sections down the side, read off their own headings',
    needs: ['workspace'],
    /*
     * One entry per h2[id], in order; pressing one brings its heading to the
     * top of the frame; the entry for the section under the reader's eye is
     * marked current.
     */
  },
  {
    name: 'list-type-filters-check',
    what: 'providers, models and connections are narrowed by type, and a provider row says its type',
    needs: ['workspace'],
    /*
     * Each sieve offers only the types the workspace has; choosing one leaves
     * rows of that type and only those, counted off what is drawn.
     */
  },
  {
    name: 'object-nesting-check',
    what: 'an object defined inside a property is drawn as rows inside the row, an object is made from a JSON Schema, and the depth is a setting',
    needs: ['workspace'],
    /*
     * The editor is asked what it draws and the server what it holds after a
     * save; rows on screen prove nothing about what was stored. Makes two
     * objects under names of its own and removes them.
     */
  },
  {
    name: 'pager-alignment-check',
    what: 'the line under a table starts where its first heading starts',
    needs: ['workspace'],
    /*
     * The pager carried a smaller side padding than the table around it, so
     * "Showing 1-6 of 6" sat ten pixels left of NAME and of the search box.
     */
  },
  {
    name: 'trigger-source-filter-check',
    what: 'the triggers list is narrowed by where a trigger listens, on the server, so a sieve reaches every page',
    needs: ['workspace'],
  },
  {
    name: 'user-row-opens-check',
    what: "a row of the Users list opens the user, from anywhere on it, and the pencil opens it once",
    needs: [],
  },
  {
    name: 'editor-tools-check',
    what: 'a dragged node and its lines wiggle; Shape outlines a card; the Joint tool and J put joints on flow and dependency lines; Shift-drag drops a new joint with a hint by the pointer; the Add menu says what each node does; panel fields have hints',
    needs: [],
  },
  {
    name: 'objects-paging-check',
    what: "the Objects page's pager counts and pages the workspace's own objects and the plugins' shapes as one list",
    needs: [],
  },
  {
    name: 'remove-dialog-wording-check',
    what: "removing a saved file or a picture asks in its own words, not a workflow's; only reads the dialog and cancels it",
    needs: [],
  },
  {
    name: 'errors-report-check',
    what: 'Admin > Reports offers Errors: how many runs, agents and quick chats failed, what failed most often, a row per failure linking to its run or conversation, narrowed by source',
    needs: [],
  },
  {
    name: 'workflow-collaboration-check',
    what: 'two tabs in one workflow editor: no Save button, each sees the other and its pointer, a move saves itself and redraws in the other, and two moves at once both stay',
    needs: ['workspace'],
    // Makes a workflow of its own and removes it again.
  },
  {
    name: 'diagram-collaboration-check',
    what: 'two tabs in one diagram editor: each sees the other and its pointer, a move saves itself and redraws in the other, two moves at once both stay, and a save over an older revision is refused',
    needs: ['workspace'],
    // Makes a diagram of its own and removes it again.
  },
  {
    name: 'document-collaboration-check',
    what: 'two tabs in one document editor: each sees the other and its pointer, typed words save themselves and appear in the other, two paragraphs written at once both stay, and a save over an older revision is refused',
    needs: ['workspace'],
    // Makes a document of its own and removes it again.
  },
  {
    name: 'wireframe-collaboration-check',
    what: 'two tabs in one wireframe editor: each sees the other and its pointer, a move saves itself and redraws in the other, two moves at once both stay, and a save over an older revision is refused',
    needs: ['workspace'],
    // Makes a wireframe of its own and removes it again.
  },
  {
    name: 'ask-person-check',
    what: "an agent's ask_person question: options with what each means, several to tick, the person's own words, and what is sent is what was chosen",
    needs: ['workspace'],
    // Makes a chat of its own and deletes it; the questions and the answer never reach the server.
  },
  {
    name: 'chat-mode-check',
    what: "a chat's mode switch in the composer's row as the app's own list matching the effort pill, opening above with a one-line hint per row, chosen from the keyboard, sent and kept, and a plan drawn as markdown with Approve and Keep planning",
    needs: ['workspace'],
    // Makes a chat of its own on the workspace's first agent and deletes it; the plan and its answer never reach the server.
  },
  {
    name: 'chat-review-live-check',
    what: 'a review the agent sends from inside a turn is drawn in the chat at once, not after a reload',
    needs: ['workspace'],
  },
  {
    name: 'chat-completion-check',
    what: "a pause in typing draws the completion model's suggestion in grey after the caret, Tab takes it, typing on is suggested to again, typing the suggested words keeps the rest, and replies under the latest answer are chips a click sends",
    needs: ['workspace'],
    // The suggestion and the workspace's Completion model are answered by the check; nothing reaches a model.
  },
  {
    name: 'chat-review-taken-check',
    what: 'a review taken back stays in the chat marked as such, with a line where it was taken back',
    needs: ['workspace'],
  },
  {
    name: 'chat-drawn-once-check',
    what: 'a picture a tool drew into a chat is shown once while the answer streams, not again under the answer',
    needs: ['workspace'],
  },
  {
    name: 'publications-paging-check',
    what: "a workflow's publications on its settings page are paged, ten to a page",
    needs: ['workspace'],
  },
  {
    name: 'workflow-title-check',
    what: 'a long workflow name in a narrow editor is cut on one line with its whole name on the title, and the toolbar keeps its height',
    needs: ['workspace'],
  },
  {
    name: 'question-scroll-check',
    what: 'a question an agent asks, arriving after its turn was drawn, is followed down to rather than left below the fold',
    needs: ['workspace'],
  },
  {
    name: 'dependency-tree-check',
    what: "a part's Used by panel draws its dependency tree: what uses it branching left, what it uses right, a column per step, a part met again a marked box rather than a second branch",
    needs: ['workspace'],
  },
  {
    name: 'skill-catalogue-search-check',
    what: "the skills search narrows by name, description and content, in a plugin's catalogue and a workspace's, across both and narrowed to each, says once when nothing matches, and gives them all back when cleared",
    needs: ['workspace'],
    // Both catalogues are stubbed; makes nothing and removes nothing.
  },
  {
    name: 'skill-search-global-check',
    what: "the skills search, typed with one catalogue open, finds matches in the others and a plugin's, grouped under each catalogue's name; the column counts and dims; choosing narrows; clearing returns; ?q= searches everywhere",
    needs: ['workspace'],
    // Every catalogue is stubbed; makes nothing and removes nothing.
  },
  {
    name: 'memory-search-global-check',
    what: "the memory search, typed with one catalogue open, finds matches in another, grouped under its name with the rest offered; the column counts and dims; choosing narrows; clearing returns",
    needs: ['workspace'],
    // Every catalogue is stubbed; makes nothing and removes nothing.
  },
  {
    name: 'skills-search-highlight-check',
    what: "the skills and memory searches mark every occurrence of the words typed in a card's name, description and markdown; a card found by what it does not draw shows an excerpt or opens; clearing removes the marks; the marks follow the last key within 300 ms",
    needs: ['workspace'],
    // Makes a skill catalogue and a memory catalogue of its own and deletes both; a plugin's catalogue is stubbed.
  },
  {
    name: 'reports-url-check',
    what: 'Admin > Reports keeps the report it shows in the address, through a pick and a reload',
    needs: [],
  },
  {
    name: 'variable-goto-check',
    what: 'a field that reads a variable links to it, and the variables page opens on that variable searched for',
    needs: ['workspace'],
    // Makes a catalog and a variable of its own; points only a parameter nobody answered, and clears it again.
  },
  {
    name: 'errors-sort-check',
    what: "the errors report's rows and what failed most often are put in the order of a pressed heading",
    needs: [],
  },
  {
    name: 'editor-hover-hint-check',
    what: "a line's and a joint's hint in the editor is the application's own box beside the pointer, not a native title",
    needs: [],
  },
  {
    name: 'editor-cut-check',
    what: 'Ctrl+X and the toolbar Cut take selected nodes and their lines off the canvas, one Ctrl+Z puts them back, and Paste brings them back in the same or another workflow, as Copy does; Ctrl+X in a text box is the text box\'s; picked joints come off their lines on Cut, alone or beside a node, and one Ctrl+Z puts them back',
    needs: [],
  },
  {
    name: 'workflow-node-check',
    what: 'a Workflow node is offered, picks another workflow, takes parameters of its own, and its run links to the run it called and back',
    needs: [],
  },
  {
    name: 'bulk-import-check',
    what: 'several exported files, or several ticked templates, import into a workspace as one plan and one press',
    needs: [],
  },
  {
    name: 'user-last-signed-in-check',
    what: 'the Users list says when each person last signed in, under its own heading, and sorts by it',
    needs: [],
  },
  {
    name: 'user-save-stays-check',
    what: "saving a user keeps the page open and says Saved, until the next edit",
    needs: [],
  },
  {
    name: 'test-on-status-line-check',
    what: "a page's Test Connection or Check is on the status line under the form, not in the save strip; and Test on Add Provider keeps the typed key and Create",
    needs: ['workspace'],
    // Every Test but Add Provider's is captured; Add Provider's real row is removed by Discard and swept by name.
  },
  {
    name: 'save-bar-check',
    what: "every page that saves has Save and Discard in one strip on the footer, from the sidebar to the window's edge, above the AI button",
    needs: ['workspace'],
  },
  {
    name: 'agent-settings-menu-check',
    what: "an agent's settings have a menu of the form's fields and cards, that scrolls to them and searches them",
    needs: ['workspace'],
  },
  {
    name: 'voice-unavailable-check',
    what: 'voice mode stays on the chat bar without a speech model, drawn off, its note naming the missing model and linking to settings',
    needs: ['workspace'],
  },
  {
    name: 'rectangle-select-check',
    what: "the canvas's corner button and its keystroke switch a drag between panning and selecting what a rectangle touches",
    needs: ['workspace'],
  },
  {
    name: 'add-menu-arrows-check',
    what: "the editor's Add menu is walked with the arrow keys, and Enter adds the entry under focus",
    needs: ['workspace'],
  },
  {
    name: 'object-dialog-actions-check',
    what: "the Create Object panel's three buttons each keep their words on one line",
    needs: ['workspace'],
  },
  {
    name: 'object-shape-panel-inline-check',
    what: "an object node's Shape panel draws an object defined inside a property as the object's page does",
    needs: ['workspace'],
  },
  {
    name: 'table-sort-check',
    what: 'a table is put in the order of whichever column somebody presses',
    needs: ['workspace'],
    /*
     * Issue #358. Two lists had a Sort control and the rest had none - the same
     * complaint that produced the per-list page size, and the same answer: the
     * heading is a component, so what a press means is decided once.
     *
     * Driven on the actions list, the first table to use it. The assertion is
     * against the server's answer for the first row under each order, because
     * the failure this catches is the quiet one: a heading that reorders the
     * twenty rows on screen and leaves the other two hundred where they were.
     *
     * Reads the workspace's own actions; makes and removes nothing.
     */
  },
  {
    name: 'trigger-history-check',
    what: "what a trigger has done is on the trigger's own page",
    needs: [],
    /*
     * Issue #357. The firing log existed and was drawn only on the list, under
     * a row somebody had to expand - but the page people open when a workflow
     * did not run is the trigger's own, and the entries that answer why are the
     * ones no run came of. Those are recorded nowhere else.
     *
     * Drives a real firing: a webhook with nothing pointed at it is called,
     * which writes the NO_INSTANCE entry this page exists to surface. Both
     * surfaces are read, because they are now one component and a change to it
     * can break either.
     *
     * Makes a webhook trigger and the shape it answers, and removes both.
     */
  },
  {
    name: 'field-type-check',
    what: "a field an Object node names for itself says what it holds",
    needs: [],
    /*
     * Issue #359. A field of a node's own was a name and a value, so a number
     * typed into one arrived downstream as the string "3" and a saved shape was
     * the only way to say otherwise - which made one node handing on a number a
     * reason to add a name to the workspace's library.
     *
     * Driven end to end: chosen in the panel, saved with the graph, read back
     * off the server, and a list of them as well as one of them. A picker that
     * shows the right word and stores nothing is the failure it is for.
     *
     * Makes a workflow of its own and removes it.
     */
  },
  {
    name: 'object-shape-panel-check',
    what: "a shape's fields are edited in the panel of the node that points at it",
    needs: ['workspace'],
    /*
     * Issue #360. A shape made from the workflow editor was a name and a
     * description: filling in the fields it exists to fix meant the object's
     * own page, which is off the graph. It is the same editor the page draws,
     * handed the panel's class names, so a property means one thing in both.
     *
     * The other half of the issue is measured by absence: the four lines of
     * prose that sat under an empty list are asserted not to be on the page,
     * and the (?) that now holds them is asserted to be.
     *
     * Makes a workflow and an object of its own, and removes both.
     */
  },
  {
    name: 'object-custom-shape-check',
    what: "the Object node's Custom shape: named in the picker, marked, and not a one-way choice",
    needs: ['workspace'],
    /*
     * Issue #309. A node with no saved shape holds fields of its own - a real
     * mode, with a fields editor that has been there all along - but the Shape
     * picker held one row per saved object and nothing else. So the mode had no
     * name on screen: an untouched node read *Choose a shape…*, which is what a
     * control somebody forgot to fill in looks like.
     *
     * The last phase is the one that could not be done at all before, and it is
     * the whole issue: choosing a saved shape was one-way, because there was no
     * row to go back to. The fields editor appearing and disappearing with the
     * choice is what says the two states are really different.
     *
     * A saved shape is made as well as the node, so "away and back" has
     * somewhere to go: a check with only the custom state could not tell a
     * picker that works from one that never changes.
     */
  },
  {
    name: 'signature-two-way-check',
    what: "the function editor's signature edited from either side, and the two settling",
    needs: ['workspace'],
    /*
     * Issue #321. The panel and the declaration are one signature with two
     * controls and only one was listened to: the panel rewrote the code, the
     * code moved nothing, and it is the panel that is saved - so typing the
     * change into the code, which is what anybody writing code reaches for, left
     * a function whose stored signature was whatever the panel still believed.
     *
     * The assertion worth the whole check is the last but one. A parser that
     * reads a declaration correctly and a page that writes one correctly can
     * still, together, never come to rest - so the check makes an edit and then
     * watches for four seconds to see the two stop rather than chase each other.
     *
     * The code is driven through the rendered lines and `insertText`, not a
     * model handle: the editor is deliberately not on `window`, and typing would
     * measure Monaco's bracket closing rather than the page.
     */
  },
  {
    name: 'workflow-duplicate-check',
    what: 'duplicating a workflow: the copy holds the same graph, is a draft, and numbers itself',
    needs: ['workspace'],
    /*
     * Issue #310. A workflow is the one thing here somebody edits while it is
     * in use, so trying a change meant redrawing it node by node or editing the
     * one that works.
     *
     * The fixture is two nodes and the edge between them for a reason: a
     * workflow of one node is copied correctly by a duplicate that drops every
     * edge, and "the copy holds the same graph" has to be a claim about
     * something.
     *
     * The second press is the other one worth the check. Workflow names are
     * unique across the installation, so a duplicate that simply appends
     * *(copy)* works once and refuses on exactly the press somebody makes
     * twice - and the copy has to be a draft whatever the original was, since
     * an event runs the published copy and a duplicate of a live workflow that
     * arrived published would be two workflows answering one trigger.
     *
     * The name carries a timestamp because `removeWorkflow` unassigns rather
     * than deletes: the definition survives the sweep, and the name with it.
     */
  },
  {
    name: 'trusted-certificates-check',
    what: 'the certificate authorities this installation trusts: the list, the page, and a bad paste',
    needs: ['workspace'],
    /*
     * Issue #322. The first version of this screen was a panel with two unpadded
     * boxes and a button reading "Trust it", and a paste that was not a
     * certificate came back as an internal error.
     *
     * The padding is measured rather than looked at, because "it looks
     * unfinished" is not something a check can be told - and it was the first
     * thing anybody said about the old one.
     *
     * The refusal is the assertion worth the check. Java's own words for a bad
     * paste are "No certificate data found", which is true and tells somebody
     * who pasted a private key, a DER file or half a bundle nothing about which
     * of those they did; the check insists on the sentence that names the
     * remedy and on the absence of the word "error".
     *
     * The certificate is built in JavaScript - see `suite/selfsigned.mjs` - not
     * because that is elegant but because the container these run in has
     * neither keytool nor openssl, and a checked-in certificate expires.
     */
  },
  {
    name: 'mcp-used-by-check',
    what: "an MCP server's page names the agents granted it, and says so when none are",
    needs: ['workspace'],
    /*
     * Issue #318. An MCP server was one of the kinds nothing was allowed to ask
     * "what uses this" about, on the grounds that nothing points at one - which
     * was never true. An agent names a server in its grants, and removing the
     * server takes that capability away from every agent holding it without
     * asking, so the page had no way to warn about what a Remove would cost.
     *
     * Two agents exist in the fixture for the assertion that matters: one
     * granted the server and one not. A panel that listed every agent in the
     * workspace would satisfy a check that only looked for the right name, and
     * the grant is matched by name rather than by id, so being loose about it is
     * exactly the mistake available here.
     *
     * The empty case is read off the alert rather than off the words. Before
     * this the question came back refused, and the refusal and the empty state
     * both land in the panel's text - so a check matching on words alone passes
     * on the refusal it was written to catch.
     */
  },
  {
    name: 'model-template-check',
    what: "models are published as a template on one workspace's Models page and used on another's",
    needs: ['session'],
  },
  {
    name: 'integration-template-check',
    what: "a connection and an MCP server are published as templates from their rows on Integrations and used on another workspace's, which asks for the credentials left behind",
    needs: ['session'],
  },
  {
    name: 'provider-edit-mask-check',
    what: 'the edit mask is offered and saved on every provider type that edits pictures',
    needs: ['workspace'],
  },
  {
    name: 'remove-asks-first-check',
    what: "a provider's, a model's and a trusted authority's Remove asks first, Cancel keeps it, and only the dialog removes it",
    needs: ['workspace'],
    /* Makes its own provider, model and a scratch authority whose key was thrown away, and sweeps them by name. */
  },
  {
    name: 'editor-agent-save-check',
    what: "the workflow editor's Save also saves an agent edited in the panel beside the canvas",
    needs: ['workspace'],
  },
  {
    name: 'workspace-copy-parts-check',
    what: 'the copy dialog asks what to take, the copy carries only that, and the choice is kept',
    needs: [],
  },
  {
    name: 'move-to-catalog-check',
    what: "a variable, a secret, a skill and a memory each move to another catalog from their row's own menu, and a refusal is shown in it",
    needs: [],
  },
  {
    name: 'variables-catalog-url-check',
    what: "the variables page keeps its catalog in the address, and a row's move and bin are one size and level, as on skills and memory",
    needs: [],
  },
  {
    name: 'workspace-menu-check',
    what: 'the workspace menu in the top bar: every workspace, the current one ticked, a readable highlight, keys that move and close',
    needs: ['workspace'],
  },
  {
    name: 'diagram-panel-resize-check',
    what: "the diagram editor's panel: the chat keeps room under long settings, the line above it and the panel's edge drag, and both are kept",
    needs: ['workspace'],
  },
  {
    name: 'topbar-long-role-check',
    what: 'a long role under the account name is cut short, and the quick actions results still open wide enough to read',
    needs: [],
  },
  {
    name: 'docs-search-typing-check',
    what: 'searching the manual on a CPU four times slower: every letter at once, no task over 200 ms while typing, pausing or choosing, and a chosen hit lands on a marked word',
    needs: [],
  },
  {
    name: 'mcp-draft-check-check',
    what: 'Test in the Add MCP Server dialog: a server is asked before it is added, and asking adds nothing',
    needs: ['workspace'],
  },
  {
    name: 'mcp-check-button-check',
    what: 'the Check button on an MCP server, and whether its reason names what failed',
    needs: ['workspace'],
    /*
     * Issue #315. There was no way to ask an MCP server whether it was there,
     * and every way a handshake could fail arrived as the same eight words - so
     * a check that only asserted the row went red would pass against the
     * behaviour this replaces. What it reads is the sentence: the server is
     * pointed at a port nothing answers on, and the reason has to name it.
     *
     * 'workspace' rather than 'fixture': it creates its own MCP server row and
     * removes it again. It needs no model, opens no agent and runs nothing -
     * the address is loopback port 9, so the connection is refused at once
     * rather than held until a timeout.
     */
  },
  {
    name: 'session-edge-check',
    what: "a session's line drawn as a dependency, against a flow line in the same graph",
    needs: ['workspace'],
    /*
     * A session is not a step - the validator does not count its line towards a
     * node's incoming, and the graph source folds it into the agents it leads to
     * before the engine sees it - and it used to be drawn with the same solid
     * line that means "and then".
     *
     * 'workspace' rather than 'workflow': it builds its own graph, because the
     * one the seed makes has no session node in it, and removes it again. It
     * needs no model and never runs anything - the graph is saved over GraphQL
     * and read back off the canvas.
     */
  },

  {
    name: 'chat-question-in-answer-check',
    what: 'an answered question is drawn inside the answer of the turn that asked it',
    needs: ['workspace'],
  },
  {
    name: 'chat-question-once-check',
    what: 'a question an agent asked is drawn once, in the turn that asked it: live, once the turn is over, and after a reload - not again in the answer before',
    needs: ['workspace'],
    /* The stream is held open mid-turn by a fetch handed to the page, and the question is answered by the page's own network. */
  },

  {
    name: 'chat-box-watch-check',
    what: "a box session an agent opens is watched from a link on the orkbox_open line, read off what the call returned, and no other call grows one",
    needs: ['workspace'],
    /* The turn is answered by the page's own network, so no model or box is needed. */
  },
  {
    name: 'chat-item-link-check',
    what: "a tool call that named a run, an issue or another item links to its page from its own folded line, live and after a reload, and one that named nothing grows no link",
    needs: ['workspace'],
    /* The turn and the history are answered by the page's own network; the server's half is ItemLinksTest. */
  },
  {
    name: 'chat-thinking-live-check',
    what: "while a turn runs only the thinking still going on is live: the first round's stops once a call follows it",
    needs: ['workspace'],
    /* The stream is held open mid-turn by a fetch handed to the page, so no model is needed. */
  },
  {
    name: 'chat-thinking-split-check',
    what: "thinking after a tool call is a folded section of its own among the calls, live and reloaded, drawn as the session's thinking card, a step smaller",
    needs: ['workspace'],
  },

  {
    name: 'executions-address-check',
    what: "the Runs page's status, date range and search are in its address, and an address opened cold sets them",
    needs: ['workspace'],
  },

  {
    name: 'editor-runs-link-check',
    what: "the editor's link to this workflow's runs: guarded, landing filtered, and the filter in the address",
    needs: ['workspace'],
    /*
     * Issue #437. Makes two workflows of one Object node each, runs both once
     * and removes them: the second exists so that "only this workflow's rows"
     * is a claim about a row that has to be kept out, not about an empty list.
     *
     * The guard is measured by what the server holds. A node is renamed and
     * the link pressed, and the graph on the server has to carry the new name
     * - that is the promise every way out of the editor makes, and a link that
     * navigated without keeping it would read as working in a screenshot.
     */
  },
  {
    name: 'workflow-parallel-check',
    what: 'a node with lines to two others: both paths run and meet once, the run page marks all three, and the Admin ceiling on steps at once is kept',
    needs: ['workspace'],
    /*
     * Issue #285. Makes a workflow of four Object nodes - one fanning out to
     * two that meet again - runs it once and removes it. That the two paths
     * overlap on the clock is the server's suite to prove, with steps that
     * take a second; an Object node takes none.
     *
     * `alone`, because it sets the installation's steps-at-once number on the
     * Admin page and puts it back, and a run started beside it would be
     * planned with whichever number it caught.
     */
    alone: true,
  },
  {
    name: 'model-answer-limit-check',
    what: 'how long a model may take to answer is on Admin Settings beside the retry settings, and a save is kept',
    needs: [],
    /*
     * It was the SDK's ten minutes, which cut a thinking model off. Sets the
     * installation-wide limit and puts it back, so `alone`: a model call beside
     * it would be made under whichever limit it caught.
     */
    alone: true,
  },
  {
    name: 'step-recovery-settings-check',
    what: "the step heartbeat and an agent step's goes after a restart are on the Admin page under Workflow runs, and a save is kept",
    needs: [],
    /*
     * Issue #601. Installation-wide: it sets both numbers and puts them back,
     * so `alone`, for the reason workflow-parallel-check is - a run started
     * beside it would read whichever number it caught.
     */
    alone: true,
  },
  {
    name: 'bulkheads-setting-check',
    what: 'the bulkheads are on the Admin page under Watchers, a number saved and a switch flipped are kept',
    needs: [],
    /*
     * Issue #616. Installation-wide: it changes the walls every agent turn
     * runs inside and puts them back, so `alone`, for the reason
     * cluster-lease-setting-check is.
     */
    alone: true,
  },
  {
    name: 'cluster-lease-setting-check',
    what: 'the cluster lease is on the Admin page under Workflow runs, and a save is kept',
    needs: [],
    /*
     * Issue #597. Installation-wide: it sets the lease and puts it back, so
     * `alone`, for the reason step-recovery-settings-check is.
     */
    alone: true,
  },
  {
    name: 'node-disable-check',
    what: 'a node switched off: drawn at half, kept by a save, skipped by a run, and shown skipped on the run page',
    needs: ['workspace'],
    /*
     * Issue #439. Makes a workflow of three Object nodes and a trigger, runs
     * it once with the middle node switched off, and removes it. Object nodes
     * because they run to completion with no model behind them, so the run's
     * own record - the step skipped and saying why, the node after it handed
     * exactly what reached the disabled one - can be read back from a seeded
     * installation.
     *
     * The dimming is asserted as a number with a floor and a ceiling rather
     * than as "not one": a fade of five percent passes "it changed" and is
     * invisible on a canvas, and a card at a tenth reads as a rendering fault.
     */
  },

  // --- the (?) that replaced the prose --------------------------------------
  {
    name: 'hint-hover-check',
    what: 'a hover shows the note, a press pins it, only its close puts it away',
    needs: ['workflow'],
  },
  {
    name: 'log-level-check',
    what: 'a logger set to DEBUG on Admin -> Settings is still DEBUG after a reload, and Reset to defaults clears it',
    needs: [],
    /* Installation-wide, on a logger of its own, and put back however the run ends. */
  },
  {
    name: 'http-tools-check',
    what: 'Admin -> Settings -> HTTP tools: two rules added, the tester answering allowed and refused on screen, an invalid pattern refused, the switch off and on',
    needs: [],
    /*
     * `alone`: it switches the agents' HTTP tools off for the whole
     * installation for a moment, and puts the policy back however it ends.
     */
    alone: true,
  },
  {
    name: 'time-zone-check',
    what: 'Preferences -> Time Zone: a zone chosen in the picker is saved, comes back with the session, and the times on a page are drawn in it',
    needs: ['workspace'],
    /*
     * Changes alice's own time zone and puts it back however it ends; the
     * times are read off one stubbed watcher row with a fixed moment.
     */
  },
  {
    name: 'session-watchers-check',
    what: "A session page's Watchers panel lists the watchers it set, running first, with what each is for and where it stands",
    needs: ['workspace'],
    /* The session and its watchers are stubbed; the query is asked of the running server for its contract. */
  },
  {
    name: 'session-rail-fit-check',
    what: "A session page's side column grows with its panels and has no scrollbar of its own - the page scrolls - while each full panel scrolls its own list",
    needs: ['workspace'],
    /* The session and three full panels are stubbed. */
  },
  {
    name: 'session-spend-check',
    what: "A session page shows what the session cost - tokens in and out, the cached, and the money - unless its workspace turned the meter off",
    needs: ['workspace'],
    /* The session and the workspace's switch are stubbed; the fields are asked of the running server. */
  },
  {
    name: 'model-speed-check',
    what: "A session page and a model page show the prompt and generation speeds the provider reported, and nothing where it reported none",
    needs: ['workspace'],
    /* The session and the model's speed are stubbed; the fields are asked of the running server. Takes any chat model. */
  },
  {
    name: 'model-speed-chart-check',
    what: "A model page charts its prompt and generation speed per minute, hour, day, month or year over the usage dates, with a gap where a period had no timed calls",
    needs: ['workspace'],
    /* The chart's answers are stubbed and the query asked of the running server; where the server has timed calls, they are counted too. Takes any chat model. */
  },
  {
    name: 'session-timers-check',
    what: "A session page's Timers panel lists the reminders its agent set, waiting first and soonest first, with each note and when it comes up",
    needs: ['workspace'],
    /* The session and its timers are stubbed; the query is asked of the running server for its contract. */
  },
  {
    name: 'watchers-check',
    what: 'AI -> Watchers opens on the running ones with Active / Finished at the top left, Stop removes one, Finished draws the ended; Admin Settings draws the three limits',
    needs: ['workspace'],
    /*
     * Issue #606. The rows are stubbed - a watcher exists because a model
     * called watcher_set, and no mutation makes one - and the contract is
     * asked of the running server, as session-notes-check does. Makes
     * nothing and removes nothing.
     */
  },
  {
    name: 'hint-placement-check',
    what: 'the note lands under its own control on a page inside the shell',
    needs: ['workflow'],
    /*
     * It once named an admin list, which has never carried a (?) - so one of
     * its pages found nothing, wrote "(skipped …: no (?) found)" and moved on,
     * and the run reported one measurement fewer than the file names. It opens
     * an admin form (`/admin/users/new`, since the shell form was removed), and
     * a page that draws no (?) is a failure with a name on it rather than a
     * line of prose in the log.
     */
  },
  {
    name: 'workspace-copy-problems-check',
    what: 'what a workspace copy left behind is collapsed until asked for',
    needs: [],
  },
  {
    name: 'admin-settings-sections-check',
    what: 'the installation settings page is in sections, each one reachable from Quick actions',
    needs: [],
  },
  {
    name: 'session-panel-hints-check',
    what: "every side panel on a session has its (?), the Thinking filter is not tinted while off, and Watchers and Schedules carry theirs beside the page name",
    needs: ['workspace'],
    // Read-only: it opens the workspace's newest session and two list pages.
  },
  {
    name: 'agent-chattiness-check',
    what: "an agent's progress messages level is chosen beside its name on its page, and an agent node can choose its own",
    needs: ['workspace', 'workflow'],
    // Changes the first agent's level and the first agent node's, and puts both back.
  },
  {
    name: 'workflow-node-effort-check',
    what: "an agent node chooses how hard its model thinks from the words its model takes, saved as its own parameter and not drawn as a raw row",
    needs: ['workspace'],
    // Makes its own provider, model, agent and workflow, and removes them.
  },
  {
    name: 'workflow-node-repeat-check',
    what: 'an action or an agent node says how many times it runs in one run, and once is saved as nothing',
    needs: ['workspace'],
    // Makes its own workflow, and removes it.
  },
  {
    name: 'workflow-node-timeout-check',
    what: 'a node that does work offers a timeout in seconds, saved with it, and emptied it is saved as nothing',
    needs: ['workspace'],
    // Makes its own workflow, and removes it.
  },
  {
    name: 'template-publish-closes-check',
    what: 'publishing a template closes the dialog rather than opening a message to close',
    needs: ['workspace'],
    // Publishes one template and deletes it.
  },
  {
    name: 'admin-workspace-type-check',
    what: 'the admin list of workspaces names each one's type, Admin or Standard, in a column of its own',
    needs: ['workspace'],
  },
  {
    name: 'template-dates-check',
    what: 'the admin list of templates says when each was published and last changed, and sorts by either',
    needs: ['workspace'],
    // Reads the templates the suite's other checks leave; publishes none.
  },
  {
    name: 'template-replace-check',
    what: 'publishing under a template's name warns in the dialog, then replaces that template',
    needs: ['workspace'],
    // Publishes one template twice under one name and deletes it.
  },
  {
    name: 'workspace-settings-load-race-check',
    what: 'Workspace Settings does not write a late load over what was typed',
    needs: ['workspace'],
    // Saves one number and puts it back.
  },
  {
    name: 'workspace-tool-rounds-check',
    what: "a workspace's Tool Rounds is saved, and an agent with no number of its own shows it",
    needs: ['workspace'],
    // Makes one agent and removes it; puts the workspace's number back.
  },
  {
    name: 'watchers-refresh-steady-check',
    what: 'Watchers keeps its height through auto-refresh rather than jumping',
    needs: ['workspace'],
    // Read-only.
  },
  {
    name: 'agent-stream-output-check',
    what: 'an agent node offers Send messages as they are written, on by default, and saving it off is kept',
    needs: ['workspace', 'workflow'],
    // Switches the first agent node off, saves, and puts it back.
  },
  {
    name: 'agent-rounds-field-check',
    what: "an agent's Tool Rounds and Tools carried at once are boxed numbers with their unit, Tool Rounds showing the installation's number when empty",
    needs: ['workspace'],
    // Read-only: it opens the first agent's settings.
  },
  {
    name: 'template-dialog-resize-check',
    what: 'Use a template grows from the corner dragged, both ways, and the opposite edges stay',
    needs: ['workspace'],
    // Opens Use template on the agents list and closes the page.
  },
  {
    name: 'dialog-hint-closed-check',
    what: "a dialog opened with the mouse does not open the note beside its title; the keyboard's focus still does",
    needs: ['workspace'],
    // Opens Use template on the agents list and closes the page.
  },
  {
    name: 'template-name-link-check',
    what: "a template's name on Admin -> Templates opens it",
    needs: ['workspace'],
    // Publishes a template of one of the workspace's agents and deletes it.
  },
  {
    name: 'template-description-check',
    what: 'Save as a template draws its description box at full height, and the choice clicked shows as chosen',
    needs: ['workspace'],
    // Opens the dialog and closes the page; publishes nothing.
  },
  {
    name: 'model-price-fields-check',
    what: "a chat model's input and output prices are edited on its own page",
    needs: ['workspace'],
    // Writes the first chat model's prices and puts back what they were.
  },
  {
    name: 'model-own-answer-limit-check',
    what: "a model's own answer time limit beside its requests per minute, empty taking the installation's",
    needs: ['workspace'],
    // Writes the first chat model's limit and puts back what it was.
  },
  {
    name: 'agent-history-changes-check',
    what: "an agent's History says what each save changed and shows a version as JSON against the one before",
    needs: ['workspace'],
    // Makes two agents of its own and deletes them.
  },
  {
    name: 'model-provider-link-check',
    what: "a model's page links to its provider, on the Provider label's line",
    needs: ['workspace'],
    // Read-only: it opens a model and follows the link.
  },
  {
    name: 'server-updates-check',
    what: 'Admin -> Updates draws what runs and what is kept, and a jar that is not one is refused on screen',
    needs: [],
    /*
     * Installation-wide and read-only: the upload it makes is refused before
     * anything is stored, so it needs no workspace and puts nothing back.
     */
  },
  {
    name: 'server-update-progress-check',
    what: 'an update downloads in the background: a bar of bytes of total, the steps after it, the reason if it fails, and back on the version once restarted',
    needs: [],
    /*
     * Read-only: the offered release, the download and the restart probe are
     * the page's own answers, so nothing is downloaded, stored or restarted.
     */
  },
  {
    name: 'release-notes-collapse-check',
    what: "an offered release's changes open and close, every one closed on arrival, and the choice is kept",
    needs: [],
    /*
     * Read-only: the offered releases are put into the page's own answer, and
     * the choice it stores in the browser is cleared again.
     */
  },
  {
    name: 'refresh-settled-check',
    what: "a run's page stops refreshing once the run has ended, and no page refreshes in a hidden tab",
    needs: ['workspace'],
    /*
     * Makes one workflow per workspace, once, and finds it again after; each
     * run of the check leaves one finished run of it behind, a few seconds long.
     */
  },
  {
    name: 'artifact-viewer-edit-check',
    what: 'a picture opened from Artifacts offers Open in editor beside Save, and lands on its editor',
    needs: ['workspace'],
  },
  {
    name: 'workflow-run-input-check',
    what: "a workflow with no trigger reads trigger.x as the run's input, and the editor does not draw it red",
    needs: ['workspace'],
  },
  {
    name: 'workspace-search-check',
    what: "a workspace's web search is set on its own Settings page, the side menu's search finds it, and its key is a secret field saved by Save Changes",
    /* Puts the workspace's key back as it found it, own value or reference. */
    needs: ['workspace'],
  },
  {
    name: 'hint-settings-check',
    what: 'the workspace settings pages moved their prose, and kept what should stay printed',
    needs: ['workspace'],
    ci: false,
    /*
     * "plugins: 0 (?) on the page, expecting 1". The plugins page has nothing
     * to explain when no plugin is installed, which is what a fresh
     * installation is - so the check asks for a note on a page that correctly
     * has none. It finds a different page on a database with plugins in it, so
     * what needs deciding is whether the page should carry its note when it is
     * empty, or whether the check should stop asking. That is a product
     * question, not a plumbing one.
     */
  },
  {
    name: 'hint-forms-check',
    what: 'the trigger and condition forms, on a settings page and inside a dialog',
    needs: ['workspace'],
    /*
     * "trigger incoming: the page drew nothing in twenty seconds" was chased
     * with a browser open, and the pages are fine: all three draw their form
     * against the developer's database in well under a second. The check was
     * asking for /triggers/18, /conditions/7 and /agents/9 - the developer's
     * numbers - and a seeded workspace hands those ids to nothing, so what it
     * was photographing was the "That trigger does not exist" card, ninety
     * characters of <main> where it waits for three hundred. It looks the four
     * up by the names `seed-demo.mjs` writes now, and says what a page actually
     * held when one does not settle, so the next one of these cannot be
     * mistaken for a blank screen.
     */
  },
  {
    name: 'trigger-switch-check',
    what: 'the Enabled switch on both screens that define a trigger, and that it saves',
    needs: ['workspace'],
    /*
     * Issues #247 and #257 were the same missing control reported twice, which
     * is why one check drives both screens: the dialog and the settings page
     * are one component, and a fix that reached only one of them is exactly the
     * regression worth catching. Whether a switched-off trigger actually fires
     * is not asked here - a page cannot deliver a Slack mention or turn the
     * clock - and is covered on all three firing paths by the server suite.
     */
  },
  {
    name: 'reply-watch-check',
    what: 'the trigger form once a connection trigger can wait for a message or a reply',
    needs: ['workspace'],
    /*
     * Issue #269. Two events that were in the enum from the start with nothing
     * publishing them, so the form has never drawn either, and each brings
     * something the form has to say for itself: a reply asks a second question
     * - whose messages it watches, which is not the connection it listens on -
     * and a message has to admit how much traffic it is about to let in.
     *
     * Whether either one fires is not asked here, because a page cannot deliver
     * a Slack event. `SlackReplyTriggerTest` matches a reply's `parent_user_id`
     * against the watched bots end to end, and `SlackMessageEventTest` proves
     * the payload carries one at all.
     *
     * The saving half needs a Slack connection whose bot token answers
     * `auth.test`, because only a connection that can say which Slack user it
     * posts as can be watched. Where the seed has none it records that it did
     * not drive that half rather than passing over it in silence.
     */
  },
  {
    name: 'silent-trigger-check',
    what: 'a trigger Slack can never deliver anything to, marked in the list, on its own page and on its connection',
    needs: ['workspace'],
    /*
     * The aftermath of #269, reported as a bug and rightly: the product knew
     * the bot token carried no `channels:history`, knew that means no `message`
     * event will ever arrive, and drew that sentence in exactly one place - a
     * Replies To row, under a checkbox, on a field only a reply opens. Every
     * other surface said Enabled, a connection, an action.
     *
     * Two legs. The real one runs against the server with nothing intercepted
     * and asserts the thing this change is one step away from getting wrong:
     * `receives` is null when Slack's response carried no scope header, that is
     * "nothing reported" rather than "missing", and a connection nothing was
     * said about must not be marked. The forced one rewrites `slackBotUsers` so
     * one connection reports `receives: false` - being unable to receive needs
     * a Slack workspace to be unable to receive in - and reads the three
     * surfaces, the colour the mark is painted, and the sentence behind its (?).
     *
     * The claim that earns it its place is the pair: a message trigger and a
     * mention trigger on the *same* connection, one marked and one not. A check
     * that only proved the mark appears would pass an interface that warned
     * about every incoming trigger, which is a worse fault than the silence -
     * it sends somebody to widen a credential that is right as it is.
     *
     * It counts the questions that reach the wire as well. `slackBotUsers` is a
     * workspace query, so a list of any length asks it once; a row that asked
     * for itself would be a Slack round trip per row.
     */
  },
  {
    name: 'dialog-hint-check',
    what: 'every dialog sentence that moved behind a (?), and every one that did not',
    needs: ['workspace'],
  },
  {
    name: 'admin-hint-check',
    what: 'the five admin screens, same story',
    needs: ['session'],
  },
  {
    name: 'admin-workspace-check',
    what: 'making a workspace an admin workspace: the switch, its reach, what it may read and its tools, saved and marked in the list',
    needs: ['session'],
    /*
     * `alone`, for the reason page-reset-check is: it makes two workspaces and
     * removes them, and workspace-selector-check counts the installation's
     * workspaces before and after a reload.
     */
    alone: true,
  },
  {
    name: 'plugin-accept-check',
    what: 'a plugin asking for permissions and capabilities is one question, and one answer loads it',
    needs: ['session'],
    /*
     * `alone`, because a plugin is loaded for the whole installation: while it
     * is in, its function stands in every workspace's catalogues, and a check
     * counting rows beside this one would count a row that vanishes.
     */
    alone: true,
  },
  {
    name: 'node-text-fields-check',
    what: "a node's written values are dragged taller, offer and light their {{placeholders}}, draw the dependency they read, and the run's lines move while dependencies stay still",
    needs: ['workspace'],
    /*
     * In place of field-expand-check: the Expand box it watched is gone, and
     * the field is now resized where it is. Makes its own trigger, function,
     * action and workflow, and removes them.
     */
  },
  {
    name: 'object-default-name-check',
    what: 'a shape picked into a nameless object node names the output after itself',
    needs: ['workspace'],
  },
  {
    name: 'agent-save-into-check',
    what: "an agent's answer saved into an object node: derived shape, dashed arrowed line, named on the panel",
    needs: ['workspace'],
    /*
     * Makes its own workflow and object under stamped names and takes both
     * away; nothing installation-wide is touched, so it runs beside others.
     */
  },
  {
    name: 'plugin-tool-grant-check',
    what: "an agent's Tools list offers what a plugin's tools() declares, and only that",
    needs: ['workspace'],
    // `alone` for the reason plugin-accept-check is: a loaded plugin is
    // installation-wide, and its rows appear in every workspace at once.
    alone: true,
  },
  {
    name: 'plugin-action-check',
    what: "an action pointed at a block a plugin's actions() declares: picked, drawn, saved, listed, and orphaned",
    needs: ['workspace'],
    /*
     * Issue #438. It loads a scratch plugin shaped as Slack's `respond` is and
     * unloads it again, so `alone` for the reason plugin-tool-grant-check is:
     * while it is in, its block is in every workspace's picker.
     *
     * The last leg is the one worth the check. The plugin is unloaded with the
     * action still pointing at it, and the page has to say so - a picker that
     * silently read as unfilled would send somebody to choose a different
     * block when the fix is to load the plugin back.
     */
    alone: true,
  },
  {
    name: 'plugin-catalog-check',
    what: 'the plugins screen opens on Local, and says what a marketplace outage costs',
    // Reads the admin screen and stubs the catalog call in the browser; it
    // loads nothing and changes nothing, so it runs beside the others.
    needs: [],
  },
  {
    name: 'session-thinking-check',
    what: "a transcript tells a model that is still thinking from one that thought for four seconds",
    // Stubs the transcript in the browser: the other half - that a node's turn
    // writes those lines at all - is AgentNodeRunnerTest, and making a real one
    // here would need a provider with a reasoning model behind it.
    needs: ['workspace'],
  },
  {
    name: 'session-todos-check',
    what: "a session's to-do list and notes are drawn below its boxes, done items ticked and struck through",
    // Stubs the session in the browser: the other half - that the agent's
    // todo_* and note_to_self tools leave behind what the page reads - is
    // SessionTodoAPITest.
    needs: ['workspace'],
  },
  {
    name: 'artifact-document-check',
    what: 'an artifact that is not a picture opens in a tab, sandboxed, instead of drawing as a broken image',
    // Reads whatever the workspace holds rather than seeding one: artifacts
    // arrive through an agent's own tool and there is no mutation to make one.
    // Says so and stops where there is nothing but pictures.
    needs: ['workspace'],
  },
  {
    name: 'new-node-centre-check',
    what: 'a node added from the menu lands in the middle of what is on screen',
    // Builds a workflow of its own, with one node deliberately far from the
    // origin, and takes it away again.
    needs: ['workspace'],
  },
  {
    name: 'custom-action-save-check',
    what: "a Custom action in a node's panel is written, and written again when it changes",
    // Builds a workflow of its own and takes it away again.
    needs: ['workspace'],
  },
  {
    name: 'finish-answer-grant-check',
    what: "an existing agent holds every built-in Always in its Tools list, and hiding one is stored as the name leaving the list",
    // Drives one agent's settings and puts the rows back as it found them. #444.
    needs: ['workspace'],
  },
  {
    name: 'skill-tools-always-check',
    what: 'the skill tools and finish_answer are held at Always while built-ins are fixed, and their rows are drawn fixed at Always',
    // Session 896: a skill tool at Offer under a tool limit was behind the search while the briefing made it the first step.
    needs: ['workspace'],
  },
  {
    name: 'chat-drawn-file-check',
    what: "a picture the model draws is in the chat's files at once, not after a reload",
    // Stubs the turn: a seeded installation has no image model to ask, and
    // what is measured is whether the page reads its files back.
    needs: ['workspace'],
  },
  {
    name: 'tool-search-check',
    what: 'the box above the tools list narrows it, under every setting of the sieve and not only one',
    // Reads what the workspace and its plugins already offer and types in the
    // box; changes nothing.
    needs: ['workspace'],
  },
  {
    name: 'settings-save-check',
    what: 'the settings page has one Save, at the top, and it stores every number that changed',
    // Writes installation settings and puts them back as it found them, so it
    // runs alone rather than beside anything that reads them.
    needs: [],
  },
  {
    name: 'catalog-room-check',
    what: 'a catalog of forty scrolls its own shelf and leaves the footer on the screen',
    // Stubs the catalog: a short shelf would not test the thing that breaks,
    // and a check written against the real marketplace goes red when somebody
    // publishes a plugin.
    needs: [],
  },
  {
    name: 'marketplace-release-check',
    what: "the catalog's tags narrow the shelf, and a listing's releases are drawn with what is no longer held",
    // Stubs the catalog call in the browser: it loads nothing and changes
    // nothing, and a check written against whatever the real marketplace is
    // offering goes red when somebody publishes a plugin.
    needs: [],
  },
  {
    name: 'picture-links-check',
    what: 'an answer that links to pictures shows them, titled, under the prose',
    // Stubs the answer and the pictures both: a seeded installation has no
    // model to ask, and a check must not fetch from somebody else's server to
    // pass.
    needs: ['workspace'],
  },
  {
    name: 'artifact-miniature-check',
    what: 'a saved artifact an answer links to is drawn small: a PDF as its first page, a broken one as a tile',
    // Stubs the answer and the files: a seeded installation has no saved
    // artifacts - only an agent's tool makes one - and what is measured is
    // the rendering, the same component a task's log and outcome use.
    needs: ['workspace'],
  },
  {
    name: 'artifact-pdf-reader-check',
    what: 'a PDF artifact is drawn in the reader, pages and text, centred in the window, and so is a research report; an HTML one stays in a sandboxed frame',
    // Uploads its own PDF and HTML file through the research-documents upload
    // and deletes them after; the research is answered by a route, so no model.
    needs: ['workspace'],
  },
  {
    name: 'chat-command-highlight-check',
    what: 'a block of commands in an answer is coloured: the command, its flags, and the Windows spellings',
    // Stubs the answer: a seeded installation has no model to ask.
    needs: ['workspace'],
  },
  {
    name: 'run-command-check',
    what: 'Run is drawn on a shell block only while Admin Settings allows it, and what the command printed is drawn under the block',
    // Stubs the answer; the run itself is real, on the server's machine. Flips an installation-wide switch.
    needs: ['workspace'],
    alone: true,
  },
  {
    name: 'parameter-picker-check',
    what: 'a plugin parameter that names its values is answered from a list, and one that does not is typed',
    // Loads a plugin, which is installation-wide: its rows appear in every
    // workspace at once, so it runs on its own.
    needs: ['workspace'],
    alone: true,
  },
  {
    name: 'image-prompt-check',
    what: "an image node's prompt survives a save and a reload, panel and server agreeing",
    // Adds a node to the fixture's graph and saves it, so it runs on its own:
    // another check reading that graph mid-way would see a node it did not
    // expect.
    needs: ['workflow'],
    alone: true,
  },
  {
    name: 'image-parameters-check',
    what: "an image node draws only the controls its model takes, and a free size has the workspace's presets",
    /*
     * Issue #431. Makes two image models of its own and takes them away, and
     * adds a preset to the workspace's menu that it removes itself. Alone,
     * because those models are in every picker on the workspace while the walk
     * runs. The graph is never saved.
     */
    needs: ['workflow'],
    alone: true,
  },
  {
    name: 'decision-node-check',
    what: "a decision node's doors, one per option and one for unsure, the lines they carry, and the provider form's optional key",
    /*
     * Issue #577. Makes a decision provider on a `.invalid` host, a model and a
     * workflow of its own and removes them; nothing is ever called. Alone for
     * the reason image-parameters-check is: the model is in the workspace's
     * lists while the walk runs.
     */
    needs: ['workspace'],
    alone: true,
  },
  {
    name: 'sieve-memory-check',
    what: 'the origin sieve on Functions and Tools survives a refresh, per list',
    // Reads two lists and sets a select; it creates nothing, so it runs
    // beside the others.
    needs: ['workspace'],
  },
  {
    name: 'plugin-details-check',
    what: 'the marketplace opens on its first listing rather than on an invitation to click',
    // Stubs the catalog call in the browser: it installs nothing and changes
    // nothing, so it runs beside the others.
    needs: [],
  },
  {
    name: 'agent-connection-grant-check',
    what: 'a connection is granted to an agent and picked for a plugin by name, never typed as a number',
    needs: ['workspace'],
    // `alone` for the same reason: it loads a scratch plugin, which is
    // installation-wide while it exists.
    alone: true,
  },
  {
    name: 'library-install-check',
    what: 'naming a package on the Libraries screen: the field, the pinned version, and the refusal',
    needs: ['session'],
    /*
     * A library belongs to the installation, not to a workspace, so sharding
     * does not separate this from `library-bundle-check` - they read and write
     * one list. It counts the rows before a refused install and again after, to
     * say nothing was loaded; the other one adding or removing a library in
     * between makes that count differ, and the failure reads as a refusal that
     * installed something anyway.
     */
    alone: true,
    /*
     * Issue #265. It reaches no registry, and could not be in this suite if it
     * did: what it drives is the half that is answered before anything is
     * fetched - a tag instead of a version - so it runs on a machine with no way
     * out and still measures the sentence somebody is shown.
     *
     * It asks the server whether a registry is configured and asserts about
     * whichever case it finds, rather than assuming the default. Both are real
     * claims: with one, the field is drawn beside the upload; without one, there
     * is no field at all, because a control that fails on being used is the one
     * thing an offline installation should never be shown.
     *
     * Since #274 it has a third half, and that one does need a package to come
     * back: a CommonJS one installs now, and the only way to say so is to
     * install one. It must not be npm's, so it is the arrangement
     * `image-model-check.mjs` already uses for the thing it cannot stub in the
     * browser - `scripts/suite/npm-stub.py`, a registry the *server* can reach,
     * serving a real gzipped tarball. Set ORKNUX_LIBRARY_STUB=1 with the
     * installation pointed at it; unset, the check says so and stops there, and
     * the first two halves are exactly what they were.
     */
  },
  {
    name: 'hint-prose-check',
    what: 'every block of prose still in the open, and the written reason for each one',
    needs: ['workspace'],
    /*
     * Ten minutes, because it opens forty-seven addresses and the default four
     * is not a budget it can finish in: at about six seconds an address the
     * sweep alone is over five minutes, and every one of those addresses is
     * allowed thirty seconds to draw before the page is given up on. It was
     * killed at thirty-seven of the forty-seven on 2026-09-06, having passed
     * every assertion it reached - a green check reported as a failure, which
     * is the one outcome a suite must not produce.
     */
    budget: 600_000,
    /*
     * The one in this group that is not about a screen somebody already
     * converted. The other six each drive a page whose prose was moved and
     * assert it stayed moved; none of them can say anything about the page
     * nobody has looked at, which is where three reports in twenty minutes came
     * from. This starts from the whole of `src/` and fails on anything left in
     * the open that is not written down with a reason.
     *
     * Its source half needs nothing at all - no browser, no server, no database
     * - and `ORKNUX_SOURCE_ONLY=1` runs that half alone in about a second. The
     * workspace is only for the browser half, which walks every fixed address
     * in `navigation.ts`.
     */
  },
  {
    name: 'status-split-check',
    what: 'four trimmed status lines, and the sentences that had to go somewhere',
    needs: ['workspace'],
    /*
     * The other side of hint-prose-check, which looks for prose still in the
     * open and would be perfectly happy with a status line whose second half
     * was deleted rather than moved. This asserts the move: the state is still
     * printed, and the sentence that left it is inside a `FieldHint` in the
     * same file.
     *
     * Its browser half drives one of the four. The bell's empty panel needs an
     * account with no notifications and the two trigger logs need a workspace
     * nothing has ever fired in, and manufacturing either against a real
     * database means changing somebody's data - so those three are asserted
     * from source and the check says so in its output rather than appearing to
     * measure something it does not.
     */
  },
  {
    name: 'revision-retention-check',
    what: 'how long component history is kept: typed, saved, reloaded, and zero refused',
    needs: ['session'],
  },
  {
    name: 'task-sweep-check',
    what: 'how long a stuck task waits: typed, saved, reloaded, zero refused, and absent on Temporal',
    needs: ['session'],
    /*
     * Issue #297. The retention check's shape against the field beside it, plus
     * the half that field has no equivalent of: the control is offered only
     * where the inline engine is running, and an installation on Temporal is
     * not shown it at all.
     *
     * That branch is driven by answering `taskSweepConfigurable` with false on
     * the way to the page. It changes what is drawn and nothing that is stored,
     * which is what makes it a fair reading of the other installation rather
     * than a second fixture nobody deploys - the alternative being a Temporal
     * server, for a boolean.
     */
  },
  {
    name: 'component-history-check',
    what: "a tool's versions and a workflow's publications: browsed, read, restored",
    needs: ['workspace'],
  },
  {
    name: 'history-hint-check',
    what: "History and Publications: the explanation behind the (?), the state still printed",
    needs: ['workspace'],
    /*
     * Builds a tool, an agent and a workflow of its own and takes them away,
     * because the half that would go unnoticed needs a component with nothing
     * in its history and a workflow nobody has published: "Nothing yet." and
     * "Never published." are statuses rather than explanations and stay
     * printed, and a check that only asked for the absence of prose would pass
     * a panel that had deleted them.
     *
     * Both directions, because the status is the half that goes wrong twice
     * over. It is asserted as the whole string the panel draws rather than a
     * substring of it - a status that runs on into a second sentence about how
     * the panel fills is teaching, and the (?) beside it is where that goes -
     * and every sentence that left the screen is asked for by name in the note,
     * so trimming one on the way behind the control is a failure rather than a
     * tidier screen.
     */
  },

  {
    name: 'icon-chrome-check',
    what: 'the picker hides the furniture and offers everything else, including the seven traps',
    needs: [],
    /*
     * The second check here that opens nothing. It has to be: a hidden icon
     * draws no pixels, so a browser cannot tell an icon deliberately kept out
     * of the picker from one a prefix-anchored regular expression swallowed by
     * accident. `plus-circle`, `search-code`, `save-all`, `sunrise`, `sunset`,
     * `moon-star` and `pen-tool` would each have gone that way silently. It
     * reads the rule out of `IconPicker.tsx` and asserts against every SVG in
     * `assets`, so it covers the icon added tomorrow.
     */
  },

  {
    name: 'row-action-check',
    what: 'the square at the end of a row answers the pointer, and alike on every page',
    needs: ['workspace'],
    /*
     * Reported as a screenshot of three buttons on one row: two did nothing
     * under the pointer and the third turned green. Underneath were sixteen
     * copies of `.rowAction` holding five different answers to `:hover`.
     *
     * It asserts in both places on purpose. The browser half proves the squares
     * answer and answer alike; the source half proves no stylesheet has taken
     * its copy back, which is the only thing that stops the thirteenth copy.
     */
  },

  {
    name: 'composer-target-check',
    what: 'the whole chat composer takes a click, and its one line sits in the middle of it',
    needs: [],
    /*
     * Reported as "the click only activates the input on a narrow area". The
     * box is 54px and the text in it 20, so most of what reads as the field was
     * dead. It asserts the three places somebody actually aims and the box's
     * height, because the padding was cut in the same breath and a check that
     * only proved the clicks would let it grow back.
     *
     * The same 34px of difference was reported again from the other side - the
     * text sat low, with 22px of air above it and 10 below, because the row is
     * aligned to the end so the buttons stay on the floor as the field grows.
     * So the air above and below the line is measured here too, along with the
     * buttons still being on that floor: the box's height, where the text sits
     * in it and where the controls sit beside it are three answers to one
     * arrangement, and a check that holds one of them lets the other two move.
     */
  },

  {
    name: 'library-bundle-check',
    what: 'several files chosen at once, asked about, and made into one library',
    needs: ['session'],
    // The other half of the pair above: one installation-wide list of
    // libraries, and two checks that both write to it.
    alone: true,
    /*
     * Issue #319. The server half is `LibraryBundleTest`, `LibraryBundleInstallTest`
     * and the two upload tests in `ScriptLibraryTest`: the graph is walked, the
     * bodies go in byte for byte, an ES module is refused by name, and what
     * comes out runs in the sandbox.
     *
     * What is left for a browser is the half made of a person: that choosing
     * several files does not quietly upload the first one, that the permission
     * is asked rather than assumed, and that which file it is entered by is a
     * control rather than a guess - a folder with no `index.js` is common, and
     * the file a guess picked is the one that would run.
     *
     * The registry is not driven here. Installing a package reaches the real npm
     * from the server, which is a network call in a browser check and somebody
     * else's fixture; the stubbed registry in `LibraryBundleInstallTest` is
     * where that half is measured.
     *
     * It removes what it made. A library left behind is one the next check finds
     * in a list it was reading.
     */
  },
  {
    name: 'chat-compaction-check',
    what: 'the card that turns chat compaction on, and the refusal it draws beside the boxes',
    needs: ['workspace'],
    /*
     * Issue #286. The server half is `ChatCompactionTest` and it proves the
     * thing itself: the older turns become one summary, the recent ones are
     * kept word for word, an unreachable summariser leaves the thread alone.
     *
     * What is here is the half a server cannot see. Three numbers are saved
     * behind one button and two of them can be refused together - a summary
     * allowed to be as long as the conversation that triggers it compacts
     * nothing - and the refusal has to arrive as the server's sentence, in the
     * card being typed into. The last feature to get this wrong put "That is
     * not a certificate this can read" on screen as an internal error, which is
     * a refusal nobody can act on.
     *
     * It turns compaction on and off again, and puts back whatever the
     * workspace had: a check that leaves a workspace summarising its chats has
     * changed what every check after it is looking at.
     */
  },
  {
    name: 'chat-off-check',
    what: 'an installation with chat switched off stops offering chat’s settings',
    needs: ['workspace'],
    // It switches chat off for the whole installation, so anything running
    // beside it is reading a product without chat in it.
    alone: true,
    /*
     * Issue #201. The only check here that changes an installation-wide
     * setting: it turns chat off, reads the workspace's settings page, and puts
     * the switch back in a `finally` - whatever happened in between, including
     * a failed assertion - and then says out loud that it put it back. A check
     * that leaves chat off is a check that broke the thing it was measuring,
     * and every check after it would be reading a different product.
     *
     * It asserts what stays as carefully as what goes. The Quick Chat model is
     * a different feature under the same word - the server's flag governs
     * `ChatAPI` and `ChatStreamAPI`, and the panel answers through its own
     * endpoint - so hiding it here would take away the only way to switch off
     * something that still works.
     */
  },
  {
    name: 'chat-header-check',
    what: 'the title bar is one row, its search searches, and its delete asks first',
    needs: ['workspace'],
    /*
     * The delete assertion is the one that matters. The trash button called
     * `deleteChat` straight through - one press, nothing said, every message
     * gone - from the header and from the row menu both. The check presses it
     * and asserts the chat is still there.
     *
     * 'workspace' rather than nothing. It used to open whichever chat `/chat`
     * landed on, which is why it was declared as needing none - and it hung on
     * a workspace whose newest conversation was empty, because the find has to
     * have something to find. It starts a chat of its own now and deletes it
     * again, so what it needs is a workspace with an agent to start one on.
     */
  },

  {
    name: 'composer-growth-check',
    what: 'Shift+Enter grows the chat box a line at a time, up to the top, and then it scrolls',
    needs: ['workspace'],
    /*
     * Issue #221. The box was one line with a 200px ceiling and no growth at
     * all, so everything past the first line was written into a slot. The check
     * measures the step rather than the direction: "it got bigger" passes on a
     * `min-height` that jumps once and then sticks. It also types far past any
     * fixed ceiling and asserts the title bar is still on screen - the first
     * attempt at this grew for ever and pushed the header off the top, which
     * only a measurement of where things landed could tell from working.
     */
  },

  {
    name: 'send-label-check',
    what: 'the send button says what is happening: waiting for the model, then answering',
    needs: ['workspace'],
    /*
     * Issue #220. "Sending…" stood from the press until the answer was
     * complete, which is a message that left in the first few hundred bytes
     * being reported as still going out for as long as the model thinks - while
     * the conversation two inches below said "Waiting for Gemma 31B…".
     *
     * It stubs `fetch` for the one address the chat streams from, and only that
     * one. Not to avoid the server: what is being checked is *when* each word
     * is shown, and that timing is the model's - a seeded installation has none
     * that answers, and a real one takes anything from half a second to two
     * minutes. Everything else on the page is the real thing.
     */
  },

  {
    name: 'chat-reattach-check',
    what: 'a chat stream that ends before its turn is picked up with /follow, and nothing is drawn twice',
    needs: ['workspace'],
    /*
     * A 637-second round was cut at the container's async timeout and the page
     * never showed the answer until a reload. It stubs the chat's stream - cut
     * after a lookup, no `done` - and the plain `/follow` that replays the turn,
     * because no real model can be told to be cut at a known frame.
     */
  },

  {
    name: 'session-ports-check',
    what: 'the Ports panel sits below Boxes, draws each mapping with its box label and a liveness dot, and its actions send their mutations; the question is in the transcript where it was asked',
    needs: ['workspace'],
    /*
     * Stubbed: a real mapping needs an agent, a box and a person. BoxPortsTest is
     * the server half - that asking, allowing and closing do what these draw.
     */
  },

  {
    name: 'chat-request-check',
    what: "a question an agent put to the person: a button per option, its outcome, at the bottom while open and between its calls once answered",
    needs: ['workspace'],
    /*
     * A real chat given a session, with its history, requests and one turn's
     * stream stubbed in the page: no model has to ask.
     */
  },

  {
    name: 'chat-files-check',
    what: "a file is drawn under the message it came with - the person's or the turn's answer - live and read back, with no strip above the composer",
    needs: ['workspace'],
    /*
     * A real chat, with its history, the upload and one turn's stream stubbed
     * in the page; the turn files one with a `filed` frame.
     */
  },

  {
    name: 'chat-audio-check',
    what: "a sound attached in a chat plays as an <audio> under its message, read back and sent, a MIDI file has a Play rather than a player, and a model's page offers Takes audio on OpenAI's own host and on an OpenAI-shaped server, not Ollama - and Save stores it",
    needs: ['workspace'],
    /*
     * The chat half stubs the history, the upload and one turn's stream in the
     * page; the model half makes its own providers on .invalid hosts, and one on
     * api.openai.com that is never called, and removes them. Whether a model is
     * sent the sound, and refused it, is ChatAudioTest's.
     */
  },

  {
    name: 'chat-sound-check',
    what: "an mp3 an agent attached plays under its answer with a download beside it, and a MIDI file's Play asks for the rendering once, says Rendering… meanwhile, and then plays it",
    needs: ['workspace'],
    /*
     * The history is stubbed in the page and the files are routed - the
     * rendering after a pause long enough to read the caption. Whether the
     * server renders MIDI is ChatAudioPlayTest's.
     */
  },

  {
    name: 'voice-play-check',
    what: 'in voice mode a sound the agent plays is fetched and played ahead of its answer, the panel says Speaking over it, the answer is read after it, and stopping the turn stops it',
    needs: ['workspace'],
    /*
     * The ears, the mouth and the turn's stream are stubbed as in
     * voice-queue-check; the stream sends a `play` frame before the answer.
     * Makes its own transcription and speech models and removes them. Whether
     * the server sends the frame only to a voice turn is ChatAudioPlayTest's.
     */
  },

  {
    name: 'voice-midturn-check',
    what: "in voice mode the agent's words before its call are spoken as they arrive, Speaking over them, without the turn waiting for a slow speech model, once though the answer repeats them, and the thinking never",
    needs: ['workspace'],
    /*
     * Issue #671. The ears, the mouth and the turn's stream are stubbed as in
     * voice-play-check; the stream sends a `said` frame, a call and an answer
     * that repeats the line, and every speech request is held for seconds.
     * Makes its own transcription and speech models and removes them.
     */
  },

  {
    name: 'chat-video-check',
    what: "a video attached in a chat plays as a <video> under its message, read back and sent, and a model's page offers Takes video where its provider carries one - a llama.cpp or vLLM host, not Ollama - and Save stores it",
    needs: ['workspace'],
    /*
     * The chat half stubs the history, the upload and one turn's stream in the
     * page; the model half makes its own providers on .invalid hosts and removes
     * them. Whether a model is sent the video, and refused it, is ChatVideoTest's.
     */
  },
  {
    name: 'upload-limit-check',
    what: "Largest file is a box under Attachments on Admin Settings and a save is kept; a chat file past it is refused before it is sent, and one the server refuses is shown in the server's words - its size, the limit and Admin Settings → Attachments - never as Failed to fetch",
    needs: ['workspace'],
    /*
     * Sets the installation-wide upload limit and puts it back, so `alone`: an
     * upload beside it would be held to whichever limit it caught. The server
     * half sends 26 MB, past the multipart cap that used to reset the
     * connection; UploadLimitHttpTest is the same through Tomcat alone.
     */
    alone: true,
  },

  {
    name: 'chat-pin-check',
    what: 'pinning a chat moves it under Pinned at once, not after the list reloads',
    needs: ['workspace'],
    /* Pins one chat and unpins it again, so the list is left as it was found. */
  },

  {
    name: 'chat-effort-check',
    what: "the reasoning effort, then the mode switch, then the microphone: adjacent and level, offering only the model's words, a pick sent, and no control for a model that takes none",
    needs: ['workspace'],
    /*
     * Makes a chat of its own on the workspace's first agent and deletes it. Which words the model takes, and
     * the pick, are answered in the page, so no reasoning model has to exist;
     * what the server sends is ChatReasoningEffortTest's. Issue #654.
     */
  },

  {
    name: 'prompt-reading-check',
    what: 'while a llama.cpp server reads a long prompt, the chat and the session page say how far it has got',
    needs: ['workspace'],
    /*
     * Stubs the chat's stream with reading frames and the session page's live
     * state, since no real server reads a prompt slowly on cue. Issue #627.
     */
  },

  {
    name: 'chat-turn-time-check',
    what: "an answer's Thought for is its own turn's time, and a turn still running shows none",
    needs: ['workspace'],
    /* Stubs two turns' streams, because the bug was one turn's time drawn under the next. */
  },

  {
    name: 'chat-answer-this-check',
    what: "a chat ending on the person's own message offers to answer it, and the answer streams under it",
    needs: ['workspace'],
    /* Puts an unanswered question on the real history's end and stubs the regenerate stream. */
  },

  {
    name: 'chat-sent-date-check',
    what: "a message sent today shows its date beside its time",
    needs: ['workspace'],
    /* Puts a line sent now on the real history's end. */
  },
  {
    name: 'attribution-launcher-check',
    what: 'the attribution strip ends short of the Ask AI launcher at narrow and wide widths',
    needs: [],
    /* Measures the strip's line boxes against the launcher. */
  },


  {
    name: 'chat-user-avatar-check',
    what: "the person's avatar is drawn beside what they said, and Preferences turns it off",
    needs: ['workspace'],
    /* Puts a line of the person's on the real history's end, and sets the preference back on. */
  },

  {
    name: 'provider-edit-mask-check',
    what: "a provider page says how its server reads a picture edit's mask, and saves the choice",
    needs: ['workspace'],
    /* Answers the provider itself. */
  },

  {
    name: 'design-magic-edit-check',
    what: 'the image editor selects part of a picture by rectangle or lasso and asks the edit model to change it',
    needs: ['workspace'],
    /* Answers the picture, the models and the queue itself. */
  },

  {
    name: 'design-upscale-check',
    what: "the image editor upscales with the server's own algorithms, imports a picked, dropped or pasted file, exports PNG, JPEG or .orkx, and Convert to video on its bar asks first only where something is unsaved",
    needs: ['workspace'],
    /* Answers the picture, the models, the algorithms and the queue itself. */
  },
  {
    name: 'design-harmonize-check',
    what: 'the image editor redraws the whole picture lightly with a chosen model, prompt and strength, as a draft',
    needs: ['workspace'],
    /* Answers the picture, the models, the options and the queue itself. */
  },
  {
    name: 'design-stop-check',
    what: 'a picture waiting or being drawn is stopped from the image editor and its gallery card, and the editor says Stopped with the picture kept; Admin Settings offers the Harmonize working size',
    needs: ['workspace'],
    /* Answers the picture, the models, the queue and the settings itself. */
  },
  {
    name: 'design-stop-line-check',
    what: "the image editor's wait is one line - the mark, Drawing…, and a padded Stop - under a picture being changed and on an empty canvas",
    needs: ['workspace'],
    /* Answers the picture, the models and the job itself. */
  },
  {
    name: 'design-image-eta-check',
    what: "a picture being drawn says how long it has taken, a WebUI's time left as about and a time from the model's usual one as estimated, and only the time taken where nothing is known",
    needs: ['workspace'],
    /* Answers the picture, the models and the job's progress itself. */
  },
  {
    name: 'design-upscale-stop-check',
    what: 'a large picture being upscaled leaves its wait and Stop in view, and Stop stops the upscale',
    needs: ['workspace'],
    /* Answers the picture, the models, the algorithms, the job and the stop itself. */
  },
  {
    name: 'design-strip-order-check',
    what: "the image editor's strip numbers each thumbnail in the order asked for, under it, and says the highest, on the left, is on top",
    needs: ['workspace'],
    /* Answers the jobs itself. */
  },
  {
    name: 'design-draft-card-check',
    what: "a picture marked Draft in Design's gallery shows its draft, on its card and opened",
    needs: ['workspace'],
    /* Answers the gallery itself. */
  },
  {
    name: 'design-history-reload-check',
    what: "the image editor's strip of a picture's versions and changes is read from the server, so a reload keeps it",
    needs: ['workspace'],
    /* Answers the picture and its history itself. */
  },
  {
    name: 'design-picture-tools-check',
    what: "the image editor's own tools - rotate, mirror, crop, the brush, selective blur and merged layers - keep a version that is what they drew, read back pixel by pixel, and Undo walks back over them; a Magic edit sends the feather chosen; Import opens a picture already in Orknux",
    needs: ['workspace'],
    /* Answers the picture, its history and every kept change itself. */
  },
  {
    name: 'import-plan-filter-check',
    what: 'the import dialog narrows its plan to what is not here, and expands it to its full length',
    needs: ['workspace'],
    /* Answers the plan itself. */
  },
  {
    name: 'import-dialog-size-check',
    what: 'the import dialog opens wide enough for its plan on one line a row, and is dragged to a size from any edge or corner, which it keeps',
    needs: ['workspace'],
    /* Answers the plan itself. */
  },
  {
    name: 'model-dialog-required-check',
    what: 'Add Model marks with a red star the fields it cannot be sent without',
    needs: ['workspace'],
  },
  {
    name: 'connection-grant-new-agents-check',
    what: 'a connection marked Grant to new agents keeps the mark and is granted to an agent made afterwards',
    needs: ['workspace'],
    /* Makes its own connection and agent, and removes both. */
  },
  {
    name: 'models-transfer-check',
    what: 'the Models page exports the models it lists, with providers and no key, and imports a models file',
    needs: ['workspace'],
    /* Imports its own provider and models, and removes them. */
  },
  {
    name: 'function-create-unchanged-check',
    what: 'a new function untouched cannot be created; typing into it turns Create Function on',
    needs: ['workspace'],
  },

  {
    name: 'executions-empty-steady-check',
    what: 'an empty executions list keeps its line and its height through refreshes',
    needs: ['workspace'],
  },

  {
    name: 'execution-logs-follow-check',
    what: "a run's log follows new lines until scrolled up, and Follow brings it back",
    needs: ['workspace'],
    /* Takes any run of the workspace and answers its log itself. */
  },
  {
    name: 'trigger-whole-object-check',
    what: 'a trigger held to a predefined object can be referenced whole, as the trigger event',
    needs: ['workspace'],
    /* Makes its own shape, trigger, function, action and workflow, and removes them. */
  },

  {
    name: 'custom-action-switch-check',
    what: 'two Custom actions keep their own parameters when the panel moves between them',
    needs: ['workspace'],
    /* Makes its own functions, workflow and actions, and removes them. */
  },
  {
    name: 'node-placeholders-check',
    what: "a node value's {{field}} placeholders are drawn as references, red when nothing answers them, and refused on save",
    needs: ['workspace'],
    /* Makes its own trigger, function, action and workflow, and removes them. */
  },
  {
    name: 'chat-call-time-check',
    what: 'every tool call in a chat says when it was made, to the second',
    needs: ['workspace'],
    /* Makes one chat of its own, answers its messages, and deletes it. */
  },
  {
    name: 'placeholder-variables-check',
    what: "a workspace variable is offered by name after {{ in a node's value, written as {{variables.<id>}}, saved, and filled in by a run - and a secret is not offered",
    needs: ['workspace'],
    /* Makes its own variables, trigger, function, action and workflow, and removes them. */
  },
  {
    name: 'run-old-version-check',
    what: 'a run of a workflow version replaced or edited since says so above its graph; one of the version on screen says nothing',
    needs: ['workspace'],
    /* Answers the version over a real run of the workspace. */
  },
  {
    name: 'design-edit-failed-check',
    what: 'a picture change that fails keeps the picture in view, says why, and says its size',
    needs: ['workspace'],
    /* Answers the picture, the models and the failed edit itself. */
  },
  {
    name: 'design-new-image-check',
    what: 'the image editor offers a new picture next to Save, and it opens a blank canvas',
    needs: ['workspace'],
    /* Answers the picture and the models itself. */
  },
  {
    name: 'design-videos-check',
    what: "Design's Videos page lists, Convert to video opens the editor near-full-screen with the picture, a video being made says how long it has taken and, from its measured progress, about how long is left, and a video made there plays",
    needs: ['workspace'],
    /*
     * Issue #658. Answers the videos, the model's settings and the pictures
     * itself, and serves a WebM it records in the page, so "plays" is a frame
     * decoded and a clock that moved. The server half - each backend's request,
     * the polling and the file kept - is DesignVideoAPITest, on both engines.
     */
  },
  {
    name: 'design-video-export-check',
    what: "the video editor's Export menu offers GIF, MP4 and MKV beside Download, says Exporting… while the server converts, downloads the file the server answered under its name, and says a refusal under the button",
    needs: ['workspace'],
    /*
     * Answers the video and the export itself, so it needs no video model.
     * The conversion - the GIF's own palette, the sound an MP4 and an MKV
     * keep - is DesignVideoExportTest, on both engines.
     */
  },
  {
    name: 'run-step-parameters-check',
    what: "a run's step lists what it was handed for its parameters, above its input",
    needs: ['workspace'],
    /* Reads a real run of the workspace whose steps were handed something. */
  },
  {
    name: 'run-step-streaming-check',
    what: "a run's agent step says whether it streamed what its agent said",
    needs: ['workspace'],
    /* Read off the newest real run with an agent step. */
  },
  {
    name: 'artifact-content-check',
    what: "an artifact's /content address opens the artifact alone, without Orknux around it",
    needs: ['workspace'],
    /* Read off the workspace's newest artifact with a page to show. */
  },


  {
    name: 'editor-catalogue-pages-check',
    what: "the workflow editor's pickers hold every page of their catalogue, so a node's action past the first hundred is shown",
    needs: ['workspace'],
    /* Answers the action list in two pages itself. */
  },
  {
    name: 'installation-address-check',
    what: 'Admin Settings sets the address the installation links from, and refuses one that is not an address',
    needs: [],
    /* Answers the address itself, so the installation's own is left alone. */
  },
  {
    name: 'installation-mail-check',
    what: 'Admin Settings stores the installation mail server, reads it back after a reload with the password shown as set and never sent, and tests it on the line below',
    needs: ['session'],
    /*
     * Against the real server, because the round trip is the point. The host is
     * under .invalid, so the test mail is refused without leaving the machine;
     * the stored server is cleared at the end, and an installation that already
     * stores one is refused rather than written over.
     */
  },
  {
    name: 'schedules-page-check',
    what: 'AI -> Schedules lists each schedule with how often and when next it runs, stops one, and Admin Settings holds its bounds',
    needs: ['workspace'],
    /* Answers the list itself; schedules are set by agents, not on the page. */
  },
  {
    name: 'model-cached-tokens-check',
    what: 'a model page shows the input its provider served from cache, and the share',
    needs: ['workspace'],
    /* Takes any chat model and answers its usage itself. */
  },










  {
    name: 'design-images-check',
    what: "Design sits in the top bar's alphabet, and a picture on Artifacts opens in it",
    needs: ['workspace'],
    /* Answers the artifact list with one picture of its own. */
  },
  {
    name: 'wireframe-editor-check',
    what: 'Design -> Wireframes opens the editor, which fills the screen as the image editor does; a tool draws what is there after a reload, undo survives the reload, and a model\'s drawing is marked where it draws and lands on the canvas',
    needs: ['workspace'],
    /* Makes its own wireframe and removes it; the model's answer is answered here, since CI has none. */
  },
  {
    name: 'wireframe-export-check',
    what: "the wireframe editor's Export saves HTML, SVG and PNG named after the wireframe, each holding what is on the screen and drawn as the canvas draws it",
    needs: ['workspace'],
    /* Makes its own wireframe and removes it; the HTML is the server's own page. */
  },
  {
    name: 'wireframe-checkbox-check',
    what: 'the wireframe editor draws a checkbox, a radio button and a switch; a press on the box ticks it, undoably, and the tick is kept by Save, drawn on the thumbnail and a checked input in the HTML',
    needs: ['workspace'],
    /* Makes its own wireframe and removes it. */
  },
  {
    name: 'wireframe-style-check',
    what: "the wireframe editor's Style gives the selection a colour or a gradient, a text colour, a border and a shadow, as drawn on the canvas, undone a style at a time, and kept by Save, the thumbnail and both exports",
    needs: ['workspace'],
    /* Makes its own wireframe and removes it. */
  },
  {
    name: 'document-list-check',
    what: "Design -> Documents: Documents after Wireframes in the menu, catalogs made and chosen, a document filed, renamed, moved, found by its words and deleted, and a catalog that holds one refused",
    needs: ['workspace'],
    /* Makes its own catalogs and documents and removes them. */
  },
  {
    name: 'document-editor-check',
    what: 'the document editor draws its document on sheets measured to their paper, keeps paragraphs off the gaps and starts a page after a break, turns and resizes the sheets with the page settings, draws an uploaded picture, puts its chat where the wireframe editor does, and downloads its exports',
    needs: ['workspace'],
    /* Makes its own document and wireframe and removes them; the picture is drawn in the page and kept as a Design picture. */
  },
  {
    name: 'document-assist-check',
    what: "the document editor's suggestion while typing - drawn after the caret, taken with Tab - and its grammar marks and replacements, and that switched off neither asks anything",
    needs: ['workspace'],
    /* The completion and the grammar check are answered here, since CI has neither model nor LanguageTool to wait for. */
  },
  {
    name: 'document-code-check',
    what: 'a code block typed as a fence is Kotlin, coloured, monospace and scrolled rather than wrapped, after a reload too, and its picker changes its language',
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'document-caret-check',
    what: "a press anywhere on a document's sheet - the middle of an empty one, below the text, beside a line - puts the caret there and what is typed lands in the document; the Page menu closes on a press elsewhere and on Escape; the chat is at the body size",
    needs: ['workspace'],
    /* Makes its own documents and removes them. */
  },
  {
    name: 'editor-title-row-check',
    what: "the row under the top bar in the document, wireframe, video, image and diagram editors draws the back link and the name at one size on one baseline, the name medium and primary, the link secondary and underlined rather than boxed when focused",
    needs: ['workspace'],
    /* Makes its own document, wireframe and diagram and removes them. */
  },
  {
    name: 'design-chat-working-check',
    what: "the working row under a question in the wireframe, document and diagram chats starts where the answers' words do",
    needs: ['workspace'],
    /* Answers the first question and holds the second itself, so no model is needed. */
  },
  {
    name: 'accent-default-check',
    what: 'somebody who never chose an accent gets blue - the page, the swatch shown as chosen and the logo, in both themes - and Moss still applies',
    needs: ['session'],
    /* A browser context of its own, so nothing chosen is in its storage. */
  },
  {
    name: 'accent-magic-check',
    what: 'the Magic accent paints filled surfaces blue into violet, and is kept over a reload',
    needs: [],
    /* A browser context of its own. */
  },

  {
    name: 'diagram-export-scale-check',
    what: "a diagram's PNG from Export is 1×, 2× or 3× its drawn width, 2× by default, and its SVG is vector",
    needs: ['workspace'],
    /* Makes its own diagram, wider than the old 1600-pixel ceiling allowed at 2×, and removes it. */
  },
  {
    name: 'diagram-shapes-check',
    what: 'the flowchart and UML shapes are offered under More shapes, each drawn as its own outline - an icon kept round above its label, a class in compartments - and a line ends on the outline',
    needs: ['workspace'],
    /* Makes its own diagram and removes it. */
  },
  {
    name: 'diagram-colours-check',
    what: "a shape's colour comes from three rows of swatches or the browser's picker, and is kept",
    needs: ['workspace'],
  },

  {
    name: 'diagram-line-styles-check',
    what: "a diagram's line is picked a style and a mark at each end, each drawn in its picker, and a line saved as an old kind draws as it did",
    needs: ['workspace'],
    /* Makes its own diagram and removes it. */
  },
  {
    name: 'diagram-tidy-check',
    what: "a wide shape keeps its side features to its height, a node's notes dot is quiet, and a line runs straight, in right angles or curved",
    needs: ['workspace'],
    /* Makes its own diagram and removes it. */
  },

  {
    name: 'documents-import-check',
    what: 'the documents list keeps its page-size picker apart from the buttons beside it, and Import takes several files at once, each a document named after its file, naming any that could not be read',
    needs: ['workspace'],
    /* Imports its own files and removes the documents they made. */
  },
  {
    name: 'document-links-check',
    what: "a link to another document shows that document's name after a rename, opens it on Ctrl+click in the editor and on a click in View, its editor lists who mentions it, the Documents button puts one in, and deleting a mentioned document names who mentions it",
    needs: ['workspace'],
    /* Makes its own two documents and removes them. */
  },
  {
    name: 'document-grammar-link-check',
    what: 'the grammar check reads a document link as its name, so no link is underlined for repeated whitespace',
    needs: ['workspace'],
    /* Answers the grammar call itself, as LanguageTool does for a run of spaces. */
  },

  {
    name: 'document-outline-width-check',
    what: "the document editor's outline column keeps its width under a long note, and is dragged wider",
    needs: ['workspace'],
  },

  {
    name: 'document-dark-page-check',
    what: "the document editor's Dark page switch draws the sheets dark with light ink and code, quote, link and Find colours of their own, is remembered, and leaves the document and its export as they were",
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'document-import-check',
    what: "Import in a document puts a file's heading, bold and list on the page in place of what was there as an unsaved change one Undo takes back, puts a text file at the caret, and says when a file cannot be read",
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'wireframe-import-check',
    what: 'Import in a wireframe places a picture from a file, one from Orknux and an SVG as image elements that draw the picture inside the frame with its shape kept, each one step Undo takes back',
    needs: ['workspace'],
    /* Makes its own wireframe and removes it; the pictures it brings in stay in Design, as any imported picture does. */
  },
  {
    name: 'document-writing-check',
    what: "while a model writes in a document the Writing pill sits centred on the sheet in the middle of the view, scrolled or not, and the whole text is outlined until the model's save shows what it changed, then only that",
    needs: ['workspace'],
    /* The model's answer is held back by the page's network, so no model is needed. Makes its own document and removes it. */
  },
  {
    name: 'missing-back-check',
    what: 'a wireframe, document or diagram that is not there says so and links back to its list',
    needs: ['workspace'],
  },
  {
    name: 'artifacts-upload-check',
    what: "a file can be put onto the Artifacts page from its header's Upload, and is kept as a saved artifact under its name",
    needs: ['workspace'],
    /* Removes what it uploads. */
  },
  {
    name: 'artifacts-replace-check',
    what: "an artifact's file is replaced from the viewer after a confirmation, and the same address then shows the new content",
    needs: ['workspace'],
    /* Uploads its own file and removes it. */
  },
  {
    name: 'document-sort-check',
    what: 'the documents list sorts by Name, Words and Updated, the numbers and dates biggest first, and a second press reverses',
    needs: ['workspace'],
    /* Makes its own documents and removes them. */
  },
  {
    name: 'document-find-check',
    what: 'Find in a document counts and marks every match across its pages, steps through them, matches whole words and replaces; the view has no bar, no chat and nothing editable, and finds too',
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'document-search-check',
    what: 'Quick actions finds a document by a word in its text, with its catalog and the words around the match, and opens it',
    needs: ['workspace'],
    /* Makes its own catalog and document and removes them. */
  },
  {
    name: 'design-chat-files-check',
    what: "a file dropped on the document, wireframe or diagram editor's chat, or picked with its paperclip, waits in a chip that can be taken off with the text box focused, and Send carries its id with the turn and shows it under the message",
    needs: ['workspace'],
    /* Makes its own document, wireframe and diagram and removes them; the upload and the model's answer are answered here, so no file is stored and no model is asked. */
  },
  {
    name: 'document-colour-check',
    what: "a word coloured from the format bar is drawn in its colour, kept by Save and after a reload, taken off by Default colour, and carried into the PDF and the ODT",
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'document-explain-check',
    what: "a selection offers Explain, Summarise, Translate and Highlight above it; Explain asks the chat read-only about the words, its answer is in the chat, and the document is unchanged and editable throughout",
    needs: ['workspace'],
    /* The model's answer is given by the page's network, so no model is needed. Makes its own document and removes it. */
  },
  {
    name: 'document-summarise-check',
    what: "Summarise over a selection asks the chat read-only about that fragment alone, and Summarise in the top bar about the whole document, saved first; both answers are in the chat and the document holds no summary",
    needs: ['workspace'],
    /* The model's answers are given by the page's network. Makes its own document and removes it. */
  },
  {
    name: 'document-translate-check',
    what: "Translate sends the selection with the words around it, shows the translation, asks again in another language, and Replace puts it in place as one step undo takes back",
    needs: ['workspace'],
    /* The translation is given by the page's network. Makes its own document and removes it. */
  },
  {
    name: 'document-highlight-check',
    what: "Highlight marks the selection and asks for a note; the highlight and note are kept by Save and after a reload, hovering shows the note, a press opens it to change, and Remove highlight leaves the words",
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'document-view-notes-check',
    what: "a document's View shows a highlight's note on hover and keeps it open on a press, only to read - no box, no Remove highlight - and lists the highlights with their notes in the column on the left",
    needs: ['workspace'],
    /* Makes its own document and removes it; clears the column's remembered folds first. */
  },
  {
    name: 'document-history-check',
    what: "History lists a document's versions with who saved each and through which door, opens one over the desk with the blocks and words its save added and took out marked, and Restore asks in the application's dialog, saves what is on screen first and puts the version back as a version of its own",
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'document-outline-check',
    what: "left of the sheets, the headings indented by level jump the desk and the caret to a section and mark the one in view as it scrolls, the highlights list their notes and select their words, and the column and its sections fold and stay folded",
    needs: ['workspace'],
    /* Makes its own document and removes it; clears the column's remembered folds first. */
  },
  {
    name: 'document-selection-settle-check',
    what: "the bar over a selection is not drawn while the mouse button is held mid-sweep or while Shift is held with the arrows, and is drawn once the button or Shift is let go",
    needs: ['workspace'],
    /* Makes its own document and removes it. */
  },
  {
    name: 'document-new-copy-check',
    what: "New and Save as copy in the document editor ask first in the application's dialog; Cancel does nothing, Save as copy opens a copy of what is on screen and leaves the original as last saved, New opens an empty document in the same catalog",
    needs: ['workspace'],
    /* Makes its own document and removes it, the copy and the new one. */
  },

  // --- Explore -> Diagrams -------------------------------------------------------
  {
    name: 'diagrams-list-check',
    what: "Explore -> Diagrams lists diagrams by catalog: catalogs made, a diagram made in one, renamed, moved, its Agents setting stored, found by a word in a node's notes, and removed after asking",
    needs: ['workspace'],
    /* Makes its own two catalogs and diagram, stamped, and removes them. */
  },
  {
    name: 'diagram-editor-check',
    what: "the diagram editor adds shapes, joins two with a line, counts a node's notes to the cap, keeps it all after a reload, puts its chat where the wireframe editor's is, and takes a model's change as one undoable step",
    needs: ['workspace'],
    /* Makes its own diagram and a wireframe to measure against, and removes both; the model's answer is answered here. */
  },
  {
    name: 'diagram-layout-check',
    what: 'Arrange lays a piled chain of boxes out left to right and top to bottom, from the button and the shortcut, and undo puts the pile back',
    needs: ['workspace'],
    /* Makes its own diagram and removes it. */
  },
  {
    name: 'diagram-note-cap-check',
    what: "the note cap is a row under Admin Settings' Limits, 5000 by default, and the number set there is what the editor's notes stop at and the server refuses past",
    needs: ['workspace'],
    /* Sets an installation-wide number and puts it back, so nothing may run beside it. */
    alone: true,
  },
  {
    name: 'diagram-label-edit-check',
    what: "a double-click or F2 types over a node's or a connection's label in place; Enter keeps it through a reload, Escape puts the old one back, and Delete or the arrows typed in it touch nothing else",
    needs: ['workspace'],
    /* Makes its own diagram and removes it. */
  },
  {
    name: 'diagram-settings-check',
    what: "the list's pencil opens a diagram's settings page, where name, description, catalog and Agents are saved and kept through a reload, leaving unsaved asks first, and the list has no Agents dropdown",
    needs: ['workspace'],
    /* Makes its own two catalogs and diagram, and removes them. */
  },
  {
    name: 'diagram-description-check',
    what: "a diagram's description is typed in the editor, stored, kept after a reload, and shown on the list on one line",
    needs: ['workspace'],
    /* Makes its own diagram and removes it. */
  },
  {
    name: 'settings-select-type-check',
    what: "a settings page's choices are drawn in its text fields' type and box",
    needs: ['workspace'],
  },

  {
    name: 'diagram-delete-tool-check',
    what: 'orknux_delete_diagram starts hidden on a new agent and on one given Orknux access afresh in the form, and its owner turns it on',
    needs: ['workspace'],
    /* Makes its own two agents and deletes them. */
  },
  {
    name: 'tool-offer-start-check',
    what: 'a new agent starts rating, pictures, MIDI, the less basic readers and the orknux_ tools at Offer, and the form draws and stores them so',
    needs: ['workspace'],
    /* Makes its own agent and deletes it; switches the workspace's built-ins gate and puts it back. */
  },
  {
    name: 'diagram-palette-check',
    what: 'Quick actions finds a diagram by its name and a node by its label, and opens the editor on that node',
    needs: ['workspace'],
    /* Makes its own diagram and removes it. */
  },

  {
    name: 'negative-prompt-check',
    what: 'a negative prompt is offered where the model draws with one, on its page and in the image editor, and sent',
    needs: ['workspace'],
    /*
     * Issue #657. The models are the server's own, on a stable-diffusion.cpp
     * provider and an OpenAI one, because whether the field is drawn is the
     * server's `takesNegativePrompt` and that is what is under test; only the
     * queueing mutation is answered in the browser, so nothing is drawn.
     */
  },

  {
    name: 'research-page-check',
    what: 'Explore > Research opens from the bar - an /analysis/ address lands there too - New research offers every option - a model chosen first, Use web search ticked, websites as lists, documents picked or uploaded, PDF first - and Start lists the research, its row at one size with a regular weight for text and medium for links, under its headings, the model a link to its page',
    needs: ['workspace'],
    /*
     * Starts one research and removes it again. A research needs a model, and
     * one that never answers will do - the check makes it where the workspace
     * has none: what is measured is that it is started and listed, so it may
     * be listed as failed.
     */
  },
  {
    name: 'research-review-check',
    what: 'New research offers Review, the reviewer picker shows only when it is ticked, and a number of follow-up questions, five until somebody says; Start sends them, the next research remembers them, and the list says a research was reviewed',
    needs: ['workspace'],
    /* The agents are the server's own and the start is answered here, so nothing runs. */
  },
  {
    name: 'research-agents-check',
    what: 'New research picks a Planner, a Writer and, ticked for review, a Reviewer from the agents, each starting on the seeded Research one with its model said beside the row; there is no model picker, Start sends the agents and no model, the writer is remembered, and the research names its agents as links',
    needs: ['workspace'],
    /* The start and the research are answered here, so nothing runs. Issue #678. */
  },
  {
    name: 'research-agent-mode-check',
    what: 'New research runs with a single agent or one per step, choosing none for anybody',
    needs: ['workspace'],
    /* Answers the start and the research in the browser, so nothing runs. */
  },

  {
    name: 'research-unreviewable-check',
    what: 'on a research mode whose workflow has no Review step, New research draws Review switched off and unticked, with no reviewer to choose and a (?) on its line saying why in one sentence; a mode with one gives the box back as it was left, and Start sends no review',
    needs: ['workspace'],
    /* The modes, the list and the start are answered here; the models are the server's own, made where there are none. */
  },
  {
    name: 'research-progress-check',
    what: 'a research shows its step, sub-questions and sources while it runs, and keeps the sources with its report; finished, it lists follow-up questions, each started as a research of its own once confirmed',
    needs: ['workspace'],
    /* Answers the research itself, running and then finished; the pipeline is the server suite's. */
  },
  {
    name: 'research-search-key-check',
    what: 'New research with web search on and no search key says so in one line and keeps Start off; unticking web search, or a workspace with a key, lets it start (#666)',
    needs: ['workspace'],
    /* Answers whether there is a key, no and then yes; the start's own refusal is the server suite's. */
  },
  {
    name: 'research-refresh-check',
    what: 'the research list and a research page have Refresh right beside Auto, on its line, and pressing it asks the server again with Auto off (#667)',
    needs: ['workspace'],
    /* Answers the list and the research itself, and counts how often they were asked. */
  },
  {
    name: 'research-form-hints-check',
    what: 'every field of New research has a (?) saying what it does',
    needs: ['workspace'],
  },

  {
    name: 'research-sessions-check',
    what: 'a research page lists the sessions its steps kept - Plan, Write - on one line under the steps, each named for its step and opening that session, the step names given the same room as without; with none there is no line (#668)',
    needs: ['workspace'],
    /* Answers the research with its sessions; that the steps keep them is the server suite's. */
  },
  {
    name: 'research-given-check',
    what: "a research's What it was given puts each value close beside its label",
    needs: ['workspace'],
  },

  {
    name: 'workflows-hidden-check',
    what: 'the research workflows are off the Workflows list until Show built-in is ticked, and open in the editor once shown',
    needs: ['workspace'],
  },

  {
    name: 'chat-session-link-check',
    what: 'a chat links to the session it is answered in, once, from its header',
    needs: ['workspace'],
    /*
     * Passes the real chat list through with a session id stamped on each chat,
     * so it needs a chat and not one that happens to have a session.
     */
  },

  {
    name: 'chat-composer-check',
    what: 'a pasted picture is attached, the "+" menu opens above on one line, and chat rows draw no icon',
    needs: ['workspace'],
    /* Stubs the upload, so nothing is stored; needs a chat whose model takes attachments. */
  },

  {
    name: 'chat-midturn-check',
    what: 'what the person writes while the agent works goes to the running turn and is drawn there at once',
    needs: ['workspace'],
    /*
     * Stubs the stream, the post and the agent on the chat list: no real model
     * can be held mid-turn on cue, and the open chat may have no agent.
     */
  },
  {
    name: 'chat-turn-grouping-check',
    what: "an agent's turn - what it said between calls, its calls, thinking, pictures and answer - is one message with one header and one Copy, live and after a reload",
    needs: ['workspace'],
    // Stubs the history, the stream and the agent on the chat list: the shape of chat 979's turn, without a model.
  },
  {
    name: 'chat-midturn-picture-check',
    what: 'a picture drawn in a turn stays above a message the person wrote into that turn afterwards, not under it',
    needs: ['workspace'],
    // Stubs the stream, the post and the agent on the chat list, as chat-midturn-check does.
  },

  {
    name: 'chat-timer-sound-check',
    what: "A chat timer chimes when it is seen to reach nought, as the workspace says unless its agent chose otherwise for it, and not for one already done",
    needs: [],
    /* The widgets and the workspace's setting are stubbed; the fields are asked of the running server. */
  },
  {
    name: 'chat-follow-bottom-check',
    what: 'After sending, the conversation stays at its foot through a tall streamed answer, and a reader who scrolls up with the wheel is left there',
    needs: ['workspace'],
    /* Stubs the chat's stream; makes a chat and removes it. */
  },
  {
    name: 'chat-widgets-check',
    what: 'the timers and stopwatches an agent keeps in a chat are drawn above the composer, tick, and answer pause and remove',
    needs: ['workspace'],
    /* Stubs the chat's widgets and a stream that adds one mid-turn: no model can be made to start a timer on cue. */
  },

  {
    name: 'chat-progress-check',
    what: "what an agent writes beside its calls is drawn as it happens, between the calls it came between",
    needs: ['workspace'],
    /*
     * The session kept these lines and the open chat was never told, so a long
     * piece of work read as a thinking block and a column of lookups. Stubs the
     * stream, because no real model can be made to remark at a known point.
     */
  },

  {
    name: 'chat-writing-check',
    what: 'while a model spells out a long tool call or its answer, the chat says what it is writing and how much has arrived',
    needs: ['workspace'],
    /*
     * A model put a file into one call and wrote for minutes after its thinking
     * ended, with nothing on the screen moving. Stubs the stream and /follow,
     * because no real model can be made to write a call of a known size, and a
     * real turn running on the chat would draw lines of its own.
     */
  },

  {
    name: 'chat-selector-check',
    what: 'the picker above a chat is drawn at its full width, and the link out goes where the name says',
    needs: ['workspace'],
    /*
     * Issue #219. The picker is 560px and was drawn 92px - it kept
     * `max-width: 100%` when it moved from a bar across the screen into the
     * title row, where 100% became the width of a model's name. Both halves are
     * asserted, because either alone would have passed at some point: content
     * clipped inside a box is not the same failure as a box drawn outside its
     * panel, and this had both. The link the same report asked for is followed
     * rather than counted - one that is present and points at the wrong row is
     * the thing a "there is a link" assertion would miss.
     */
  },

  {
    name: 'model-agent-check',
    what: 'a chat model on the Models screen becomes an agent in one press, granted nothing',
    needs: ['workspace'],
    /*
     * The other half of issue #295. Taking the bare model away closed the short
     * path for "I have just added a model - does it work?", and this is the
     * path put back.
     *
     * Four assertions rather than one, and each is a different way the shortcut
     * could be a mistake instead of a convenience: it is offered only on a model
     * that can hold a conversation, it lands on the agent rather than in a chat,
     * it names the agent after the model without colliding, and it grants it
     * nothing. The last is read off the API rather than the page, because it is
     * the one that matters most and the settings screen draws an ungranted agent
     * and an unloaded page identically.
     */
  },

  {
    name: 'chat-agents-first-check',
    what: 'the picker above a chat offers agents first, and opens on whichever half holds the ticked one',
    needs: ['workspace'],
    /*
     * Issue #249. Two assertions that a lazy fix would separate: the tabs are
     * in a fixed order whatever the chat holds, and which of them opens follows
     * the chat and defaults to Agents. Reordering the tabs alone passes the
     * first and fails the second, which is why both are here.
     *
     * The chats it reads are made by the check and deleted again - what each
     * one is pointed at is the whole of what this measures, and reading
     * whichever chat happened to be first would measure whatever somebody last
     * left open.
     */
  },

  {
    name: 'chat-workspace-switch-check',
    what: 'switching workspace from a chat leaves you in the chat, about the other workspace',
    needs: ['workspace'],
    /*
     * Issue #250. Staying put is the half a fix that did nothing would also
     * pass, so the check asserts the conversations listed are now the other
     * workspace's and that the corner names it - a chat that has not changed
     * what it is about has not switched anything.
     *
     * It caught its own fix being half-written: the chat page read the
     * remembered workspace through a store but the effect that used it was
     * still keyed to the mount, so the corner moved, the page stayed, and the
     * sidebar went on listing the workspace that had just been left.
     *
     * The fourth assertion is about the rule that did not change: from a list
     * page, switching still lands on the same list in the new workspace.
     */
  },

  {
    name: 'hover-sweep-check',
    what: 'every small icon control on seventeen pages answers the pointer',
    needs: ['workspace'],
    /*
     * The wide one. `row-action-check` proves four pages and the stylesheets
     * behind them, and passed while a fifth of the product's icon controls did
     * nothing - the same square was declared as `.settings`, `.addMenu`,
     * `.refresh` and a bare `.toggle` in nine more files, and a check built
     * around names somebody already knew could not find any of them.
     *
     * This one knows no names: it finds everything drawn at about the size of
     * an icon button and hovers it. It also counts "could not reach it"
     * separately from "it did not respond" - the first version turned a
     * swallowed hover error into fifteen false findings on the triggers page,
     * whose buttons were simply off the right-hand edge.
     */
  },

  {
    name: 'attribution-check',
    what: 'the licence notice is on screen on every shell, and says which version',
    needs: ['workspace'],
    /*
     * The one check here where what breaks is not a bug but a licence term.
     * `Attribution.tsx` argues at length why it exists - AGPL 5(d), the 7(b)
     * term in NOTICE, the section 13 offer of source - and nothing had ever
     * checked it was actually drawn. One `display: none` from a stylesheet it
     * does not own and the obligation stops being met with nothing failing.
     *
     * The version is asserted against `package.json` rather than a number
     * written into the check, so a release bump cannot leave the two
     * disagreeing.
     */
  },

  // --- pages that are pages -------------------------------------------------
  {
    name: 'cron-reading-check',
    what: 'a cron expression reading back as English while it is typed, on both surfaces that ask for one',
    needs: ['workspace'],
    /*
     * Issue #203 made a cron of seconds a schedule the server keeps rather than
     * one it merely accepts, and started refusing an expression that parses and
     * never comes round. The field now says what the expression does, and the
     * (?) beside it names the six positions in the server's own order.
     *
     * Two of its assertions are the ones worth having, and neither shows in a
     * screenshot. It types a character that ruins a good expression and asserts
     * the sentence changes: a reading held in state and updated a render late
     * reads exactly like a reading and is a lie at the one moment somebody is
     * relying on it. And it measures the top of the Timezone field across the
     * longest and shortest readings there are, because a hint that wraps to two
     * lines and back moves everything under it while somebody is typing.
     *
     * It builds its own scheduled trigger over GraphQL for the second surface -
     * the settings card - and removes it again, since the seed does not promise
     * one with a known expression in it.
     */
  },
  {
    name: 'docs-zoom-check',
    what: 'a picture in the manual opens at full size, and keeps its colours on white',
    needs: ['session'],
    /*
     * Issue #217. It measures the picture twice - in the column, then in the
     * viewer - because "a viewer opened" is not the request: a viewer that
     * draws the same 720px picture has zoomed nothing.
     *
     * The light theme half was found while writing it, and is the reason the
     * check does not stop at the click. `tokens.css` darkens every `<img>` to
     * 42% brightness so the stroked icon files stay readable on white, and the
     * manual's forty-six screenshots were going through it too. Nothing failed;
     * the manual was simply illustrated with photographs taken at dusk.
     */
  },
  {
    name: 'recently-opened-check',
    what: 'the box in the top bar puts you back on what you last had open, by a keystroke of its own',
    needs: ['workspace'],
    /*
     * Issue #246. It builds two functions of its own and removes them, so it
     * needs a workspace and nothing that is in one.
     *
     * Two of its assertions are the design rather than the screen, and they are
     * why this is a check and not a screenshot. One renames a function behind
     * the browser's back and requires the list to show the new name: what is
     * stored is an address, and a stored *label* would pass every other
     * assertion here while quietly printing last week's word for ever. The
     * other deletes one and requires the row to be gone, which is the same
     * mechanism read the other way - an entry is only drawn while the thing it
     * names is still in the names the box has already fetched.
     *
     * It also stands over `palette-actions-check`'s ground for one assertion:
     * Create issue has to survive the rows now above it. Two checks asserting
     * one thing is usually a smell, but the whole risk of this change was
     * pushing #218's row off the end of a list of ten.
     */
  },
  {
    name: 'palette-actions-check',
    what: 'Quick actions offers things to do as well as places to go, and is named for it',
    needs: ['workspace'],
    /*
     * Issue #218. The row has to be there before anything is typed - that is
     * the half a check earns its place on, since a quick action nobody knows
     * about is not one - and pressing it has to land on the page that starts an
     * issue rather than on the list of them.
     *
     * It records what typing each word actually offers, which is how it came
     * out that this box scores a row against the whole of what was typed: "new
     * issue" matches nothing at all, because no label and no also-known-as
     * holds that phrase. Left as it is and written down here rather than
     * quietly fixed - one word is what people type into a box this size.
     */
  },
  {
    name: 'admin-width-check',
    what: 'every page under Admin fills the column it was given, and none of them caps it',
    needs: [],
    /*
     * Needs nothing, and is the only one here that does not: it opens no
     * browser and speaks to no server. It reads the admin paths out of
     * `navigation.ts`, follows each through `routes.tsx` to the file that draws
     * it, and asserts that nothing a page puts directly inside `<AppShell>`
     * carries a max-width.
     *
     * That is the point rather than a shortcut. Half these pages need a fixture
     * to render at all - the database this was written against had no template,
     * so `/admin/templates/:templateId` drew nothing - and a measurement only
     * covers the pages that happened to have something in them. Read out of
     * `src/`, it covers every page there is, including the next one somebody
     * adds.
     */
  },
  {
    name: 'condition-page-check',
    what: 'the condition editor as a page: create, find, change, reload, jump to its function',
    needs: ['workspace'],
    /*
     * In, and for two reasons that were both about the check.
     *
     * It waited for a link reading "Open definition", and 2df9a15 made every
     * one of those a mark - the words moved into the title and the
     * aria-label. So it spent thirty seconds waiting for text nothing draws and
     * then reported a missing link on a form that has one. It asks for the
     * accessible name now, which is what the convention actually promises, and
     * checks the mark is a mark.
     *
     * And it was held out of CI for "the workspace has no function to point a
     * condition at" - true, because only a function returning a boolean can
     * answer a condition and the seed writes none. It makes its own now, and
     * deletes it, so it says the same thing on every installation.
     */
  },
  {
    name: 'action-page-check',
    what: 'the action editor as a page: create, find, change, reload, Used by, and the Danger Zone',
    needs: ['workspace'],
    /*
     * An action was the last component edited only in a modal. It follows the
     * condition's page rather than a third arrangement, so this follows
     * `condition-page-check` - with one assertion of its own, that `Used by` is
     * drawn here. #258 put that panel in the dialog because an action had no
     * page, and a check that did not look for it on the page would let it be
     * lost in the move without anything going red.
     *
     * It builds a wait on a fixed time, which is the one subtype that names
     * nothing else in the workspace, and deletes it through the Danger Zone -
     * so the deletion is driven rather than assumed, and nothing is left behind.
     */
  },
  {
    name: 'action-headers-check',
    what: "an HTTP action's headers as rows, an old JSON column read as rows, and a variable's value nowhere a reference to it is drawn",
    needs: ['workspace'],
    /*
     * Written and never registered, so it went stale unseen: the picker's rows
     * became options with #582, the save button moved to the strip outside the
     * form, and the reference picker grew a clear button sharing its label.
     * Makes its own catalog, secret variable and two actions, and removes them.
     */
  },
  {
    name: 'search-settings-check',
    what: "a workspace's search key is masked until Show, never in the query, and saved by the page's Save Changes",
    needs: ['workspace'],
    /*
     * Issue #510. Sets keys of its own on the fixture's workspace, then puts
     * back what it found - read first through the reveal, or the reference.
     */
  },
  {
    name: 'definition-jump-check',
    what: "the way out of a function's object parameter to that object's editor",
    needs: ['workspace'],
    // Wants a function it can give an object parameter to. ORKNUX_FUNCTION.
  },
  {
    name: 'action-jump-check',
    what: "the way out of an action's four pickers to what they name",
    needs: ['workspace'],
  },
  {
    name: 'action-message-connection-check',
    what: 'an action sending a message offers only the connections that can send one',
    needs: ['workspace'],
    /* Makes an HTTP connection standing in for Jira and disconnects it at the end. */
  },
  {
    name: 'plugin-picker-save-check',
    what: 'a choice in a plugin parameter picker waits for Save, like anything typed',
    needs: ['workspace'],
    /* Loads a plugin of its own with an options parameter, and unloads it. */
  },
  {
    name: 'reference-unset-check',
    what: "a reference to a variable is taken off by Value or by the picker's clear, and that saves - a plugin parameter and an MCP server's token",
    needs: ['workspace'],
    /* Loads a plugin of its own and makes a catalog, two variables and an MCP server, and removes them all. */
  },
  {
    name: 'workflow-variable-reference-check',
    what: 'a node parameter can reference a plain workspace variable, and a secret is not offered',
    needs: ['workspace'],
    /* Makes a function, an action, a workflow and two variables, and removes them. */
  },
  {
    name: 'workflow-create-opens-editor-check',
    what: 'creating a workflow opens its editor',
    needs: ['workspace'],
    /* Makes a workflow and removes it. */
  },
  {
    name: 'node-plugin-picker-check',
    what: "a node's Action and Condition pickers offer the plugins' actions and functions, and picking one makes the node's own definition",
    needs: ['workspace'],
    /* Loads a plugin of its own and unloads it; makes a workflow, whose own definitions go with it. */
  },
  {
    name: 'field-whole-object-check',
    what: 'the field picker marks the row that hands on a whole object, and draws its fields under it',
    needs: ['workspace'],
    /* Makes a shape, a function, an action and a workflow, and removes them. */
  },
  {
    name: 'node-multi-select-check',
    what: 'Shift+click selects several nodes, which move together and are removed together',
    needs: ['workspace'],
    /* Issue #630. Makes a workflow of three object nodes and removes it. */
  },
  {
    name: 'token-access-check',
    what: 'an access token is made read-only from its picker, listed so, and refused a mutation while a query answers',
    needs: ['workspace'],
    /* Makes a token and revokes it. */
  },
  {
    name: 'used-by-check',
    what: 'where a component is used: both states of the panel, and a row followed to the end',
    needs: ['workspace'],
    /*
     * Issues #258 and #268. It builds its own function and its own tool that
     * imports it, so that both answers are real: a component nothing points at
     * says so in words, and the same component with an importer names it. An
     * empty panel and a panel that failed to load are the same picture, which
     * is why the first half is asserted at all.
     *
     * The row is pressed rather than read. `agent-jump-check` found the failure
     * worth catching here - a link naming one thing and opening another - so
     * what it asserts is the name on the page it landed on, not the href.
     */
  },
  {
    name: 'agent-definition-check',
    what: "an agent node's definition opening in the panel, beside the graph, like a trigger's",
    needs: ['workflow'],
    /*
     * Runs against the workflow the seed builds: a trigger node pointing at a
     * trigger and an agent node pointing at an agent, which is what it presses
     * Open definition on. It saves the agent it opened - with the values it was
     * already holding, and it reads the name back afterwards to say so.
     */
  },
  {
    name: 'image-model-drawer-check',
    what: "an image node's model opening in the drawer beside the graph, saved there, and following the node's picker",
    needs: ['workspace'],
    /*
     * Makes a provider on a `.invalid` address, two image models on it and a
     * workflow with one image node, and takes them all away; nothing is drawn,
     * so it needs no image endpoint. Alone, because its two models are in every
     * image picker in the workspace while it runs, which is what
     * image-parameters-check counts.
     */
    alone: true,
  },
  {
    name: 'image-model-new-check',
    what: "an image node's New beside Image Model making an image model in the drawer, the node pointing at it and the drawer holding it",
    needs: ['workspace'],
    /*
     * Makes a provider on a `.invalid` address and a workflow with one image
     * node and no model; the check makes the model through the drawer, and all
     * three are taken away. Alone for the same reason as image-model-drawer-check:
     * the model it makes is in every image picker in the workspace while it runs.
     */
    alone: true,
  },
  {
    name: 'node-default-icons-check',
    what: "every kind of node card drawing a picture where nobody chose one, a chosen one replacing it, and the run page's cards drawing the same",
    needs: ['workspace'],
    /*
     * Makes two workflows, a Speak action and one run of its own, and takes the
     * workflows and the action away. The run is two Object nodes, which need
     * no model and finish at once.
     */
  },
  {
    name: 'agent-memory-check',
    what: "an agent's session memory: the slider, the server's figures, and a refusal that stops Save",
    needs: ['workspace'],
    /*
     * Issue #226. What a session hands back to a model is a share of the chosen
     * model's context window, and every number and every sentence involved is
     * the server's - so what this measures is that the page prints what the API
     * answered, character for character, rather than that the figures are
     * right. A screen that recomputed one of these and landed a token out fails
     * here, which is the whole point of asserting against the API rather than
     * against numbers written into the check.
     *
     * It provokes the refusal rather than hoping for one: it makes a model with
     * a small window that reserves most of it for its answer, so half of that
     * window is a share that model cannot give. Waiting for a seeded model to
     * happen to refuse something is a check that passes on the installations
     * where it does not. Both models and the agent are removed again.
     */
  },
  {
    name: 'agent-model-picker-check',
    what: "the agent's Model field names each model's provider, so two models of one name can be told apart",
    needs: ['session'],
    /*
     * Builds a scratch workspace of its own - two providers, each serving a
     * model of the same name, and an agent - and deletes it at the end. Nothing
     * is called on either provider: the endpoints are `.invalid`.
     */
  },
  {
    name: 'workspace-memory-check',
    what: "the workspace's default session memory, what it means per model, and the agent that inherits it",
    needs: ['workspace'],
    /*
     * The follow-up half of #226. The share stayed on the agent and gained a
     * step behind it - agent, then workspace, then the built-in allowance - so
     * there are two screens now and one quantity, and the seam between them is
     * what this drives: a default set on the workspace's settings page has to
     * turn up on an agent that set nothing, named as inherited, and clearing it
     * has to put that agent back on the built-in allowance.
     *
     * The assertion worth the whole check is the one about two models. It makes
     * a 200,000-token window and an 8,000-token one and asks the same 25% of
     * both: the second cannot give it, the screen has to say so in the server's
     * words, and Save has to stay on - because the server judges a workspace
     * default on the bounds alone, deliberately, and a screen that invented a
     * per-model refusal there would refuse a default that is right for every
     * other model in the workspace. A screen that quietly blocked the save
     * would pass every other assertion here.
     *
     * It also reaches past the track's own end once, on purpose. The track
     * stops at the server's ceiling so a share outside the bounds cannot be
     * dragged to; the refusal slot beneath is the safety net for those two
     * copies of the ceiling parting company, and a safety net nothing ever
     * tests is one nobody knows is torn. Both models, the agent and the default
     * are put back afterwards.
     */
  },
  {
    name: 'voice-turn-taking-check',
    what: "the workspace's voice turn-taking: the three boxes, the bounds, and a turn that really ends on them",
    needs: ['workspace'],
    /*
     * Issue #256. Voice mode kept answering while somebody was still talking,
     * three times over two numbers, and the numbers behind it are a judgement
     * about how people talk rather than a fact about audio - so a workspace can
     * move them, and the server stores only a departure from what the interface
     * already does.
     *
     * Two assertions are worth the whole check. The first is that an empty box
     * names voice mode's own value, read out of VoiceMode.tsx by the check
     * rather than written into it: a settings page holding its own copy of 2.5
     * seconds goes on saying 2.5 seconds after that file says something else,
     * which is a form lying about the product it configures, and nothing else
     * here would notice.
     *
     * The second is why this drives audio at all. A setting that is stored and
     * never read is worse than no setting, and every other assertion here would
     * pass on a page that saved three numbers nothing consults. So the panel is
     * given a fake microphone - a file that speaks for a moment and then stops
     * - and the turn is timed twice: once with nothing set, where it has to end
     * on voice mode's own pause, and once with a longer pause set, where it has
     * to end that much later. How far, not whether: a turn that merely took
     * longer would pass on a slow machine.
     *
     * The other two settings are asserted stored, cleared and bounded rather
     * than heard. The sensitivity cannot be defeated by a loud tone - a fixed
     * level qualifies a voice on its own, deliberately, so a silent room is not
     * absurdly sensitive - and the unattended microphone's floor is five
     * minutes, which is not a thing to sit in front of. What can be measured
     * about those two is measured from the source instead: the watching loop
     * has to read all three off the workspace, and a constant put back in the
     * middle of it fails here.
     *
     * Both models, the chat and the settings are put back afterwards.
     */
  },
  {
    name: 'chat-interrupt-check',
    what: 'stopping a turn really stops it: the request is aborted, not merely stopped being listened to',
    needs: ['workspace'],
    /*
     * Issue #299. The circle put the panel back to Listening and left the
     * request open, so the model went on writing an answer nobody would hear
     * and every word of it was charged for - and the next thing said raced a
     * turn that had never ended. Everything on screen said it had stopped,
     * which is why nothing caught it: the only place the bug is visible is the
     * request.
     *
     * So the assertions are made off the request rather than off the screen.
     * The stream is stubbed to open and then say nothing, which is the state
     * somebody is in when they decide they have heard enough, and what is
     * counted is the signal firing and the body being cancelled - the second
     * being what closes the connection and therefore what the server can read
     * as nobody being left. Both doors are driven, the composer's Stop and the
     * circle, because two interruptions that disagree are two bugs waiting.
     *
     * No microphone is granted, deliberately. A turn typed into the composer
     * while the panel is open is handed to the panel and answered by it exactly
     * as a spoken one is, and a fake device would decide for itself when a turn
     * began.
     */
  },
  {
    name: 'chat-woken-live-check',
    what: 'a turn the server starts on a chat by itself (a watcher firing) is drawn live on the page open on it',
    needs: ['workspace'],
    /*
     * The answer of a woken turn reached the history and not the screen of the
     * person watching the chat, until they reloaded. Fails without the fix:
     * nothing on the page asked to wait, so the woken frames had no reader.
     */
  },
  {
    name: 'chat-leave-return-check',
    what: 'a chat left while the agent is thinking: the answer arrives live on return, is kept, and Stop still stops it',
    needs: ['workspace'],
    ci: false,
    /*
     * Issue #201. The server finished a text turn whose reader left (#335), but
     * a page that came back while the answer was still being written read the
     * history once, found only the question and never heard of the answer -
     * so from where the person sat the reply was lost. The assertion that
     * fails without the fix is the first: back mid-thinking, the answer has to
     * arrive on the page that came back, without a reload. The other two are
     * the edges of the same change - a tab closed mid-thinking finds the
     * answer kept, and a turn picked up on return can still be stopped, with
     * nothing kept of it.
     *
     * `ci: false` for the reason `task-live-check` gives: there has to be a
     * "while it is thinking" to leave in, and that is a model the server calls
     * taking its time. `scripts/suite/slow-chat-stub.py` thinks for twenty
     * seconds before it answers. Run it by hand:
     *
     *   python scripts/suite/slow-chat-stub.py 8197
     *   node scripts/suite/run.mjs --only chat-leave-return-check
     *
     * Where the stub is, as the server reaches it, goes in
     * ORKNUX_SLOW_CHAT_STUB.
     */
  },
  {
    name: 'voice-queue-check',
    what: 'what is said or typed while voice mode is busy: held, shown, and sent when the turn comes round',
    needs: ['workspace'],
    /*
     * Issues #254 and #262. The microphone used to close between turns, so
     * everything said while the model was thinking or the answer was being read
     * went nowhere at all - which is most of a conversation. It is held open
     * now and what changes is where the words go.
     *
     * Three of its assertions could not be made any other way. That a message
     * is *added* to the one already waiting rather than replacing it, which is
     * the decision about being talked over and is invisible in any single
     * screenshot. That the waiting message goes out by itself when the turn
     * ends, with nobody pressing anything. And that the panel never says
     * Speaking while no sound has come out - the speech model is stubbed to
     * take a known time over a clip, and the caption is watched across exactly
     * that gap, which is where it used to lie.
     *
     * The last phase is a regression rather than a feature: cutting in used to
     * silence the panel for the rest of the session, with the microphone still
     * working and the answers still arriving. It interrupts on purpose and then
     * insists on hearing the turn after it.
     *
     * The microphone is a file Chromium is told to believe, and the ears, the
     * mouth and the model are stubbed - not to avoid the server, but because
     * every assertion here is about timing that belongs to none of them. The
     * models and the chat it makes are put back afterwards.
     */
  },
  {
    name: 'voice-regenerate-check',
    what: 'asking for the answer again, in voice mode, and hearing the one that comes back',
    needs: ['workspace'],
    /*
     * Issue #314. The composer and the panel were two doors into the model and
     * only one of them was wired to the mouth: a conversation held out loud
     * went silent at exactly the press that says the last answer was not good
     * enough, because nothing in the panel had been told a turn was happening.
     *
     * The two assertions worth the whole check are the ones no screenshot
     * reaches. That the *second* answer is what is read - the stubbed answers
     * are two different sentences, and what the speech model was handed is
     * compared against them, so reading the first one again fails here. And
     * that exactly one regenerate leaves and no second message is sent to the
     * chat, which is the difference between going through the panel and going
     * round it.
     *
     * The microphone speaks once and then stops, unlike the one in
     * `voice-queue-check`: the press is made in the quiet after the first turn,
     * and a device still talking would take that quiet for a turn of its own.
     */
  },
  {
    name: 'read-progress-check',
    what: 'An answer read aloud shows how much of it has been heard, as a bar and a percentage that climb with the audio and go when it ends',
    needs: ['workspace'],
    /* Stubs the chat's stream and the speech endpoint; makes a speech model and a chat and removes them. */
  },
  {
    name: 'spoken-answer-check',
    what: 'the speaker under an answer reads what it renders to, a sentence at a time',
    needs: ['workspace'],
    /*
     * Issues #255 and #263 over one seam. It was handed the markdown, so an
     * answer read aloud pronounced the asterisks, the backticks, the hashes and
     * the address inside every link; and it was handed all of it at once, so
     * the wait before the first word was the wait for the last one to be
     * synthesised.
     *
     * The assertions worth the whole check are the last three. Anything that
     * strips a character passes the ones about markup; only a reader that
     * pipelines passes "sound started before the last piece was even asked
     * for", and only one that keeps a lid on it passes "never more than two
     * being made at once" - asking for every piece the moment an answer lands
     * would put a burst on a provider for audio nobody may ever hear.
     */
  },
  {
    name: 'image-model-check',
    what: 'the picture button in a chat, and the drawing it puts in the answer',
    needs: ['workspace'],
    ci: false,
    /*
     * Issue #240, the interface half. The server half is `ChatPictureTest`, ten
     * tests on both engines over a stub on the loopback address: which endpoint
     * is called, which providers are refused without being called, where the
     * bytes go, what the picture cost.
     *
     * What that cannot say is whether anybody can find it. The assertions worth
     * the whole check are the two about the answer bubble - the picture is drawn
     * *inside* it rather than only listed in the file row above the composer, and
     * it has loaded, which is `naturalWidth` and not the presence of an `<img>`,
     * because a broken picture is an `<img>` too. Then the cost line, which must
     * say four cents and must never say $0.00: an image model reports no tokens,
     * so the ordinary arithmetic makes every drawing free.
     *
     * Not in CI, and the reason is one thing. Every other chat check stubs the
     * provider inside the browser; this one cannot, because the drawing happens
     * on the server from a mutation and a stub in the page would be a check of
     * the stub. It needs something answering `/images/generations` that the
     * *server* can reach - `scripts/suite/image-stub.py`, a dozen lines and a red
     * square, named in ORKNUX_IMAGE_STUB - and the CI installation is a
     * container with nothing beside it. Closing that gap means a service in the
     * browser job's compose file, which is a change to how CI is built rather
     * than to this check.
     */
  },
  {
    name: 'decision-run-check',
    what: 'a keyless decision provider checked on its form, and a run taking the option the model picked',
    needs: ['workspace'],
    ci: false,
    /*
     * Issue #577, the half that asks a model. The server half is
     * `DecisionNodeTest`, on both engines over a stub on the loopback. Not in CI
     * for image-model-check's reason: the question is asked by the server, so
     * it needs something the *server* can reach answering `/v1/systemone` -
     * `scripts/suite/decision-stub.py`, named in ORKNUX_DECISION_STUB.
     */
  },

  {
    name: 'speech-chunking-check',
    what: 'what one answer costs to read aloud on each of the three things a workspace can say about cutting it',
    needs: ['workspace'],
    /*
     * The other side of #263. Reading became pipelined and the pieces became
     * sentences, which is the right answer for somebody holding a hands-free
     * conversation and the wrong one for somebody listening to a written
     * answer: they hear the join between every sentence and pay for a request
     * behind each one. It is a listening preference rather than a fact, so the
     * workspace says.
     *
     * The assertion that earns it a place is a count on the wire, and
     * deliberately not the setting read back. Reading it back proves it
     * persisted, which the server's own test already says and which a page that
     * saved the value and went on cutting at sentence ends would also pass. The
     * same answer read three times has to cost one request under None, one per
     * paragraph under Paragraph, and more than either under Sentence - and
     * nothing but a setting that reaches the speech provider produces that.
     *
     * Beside it: all three read the same words in the same order. A mode
     * decides where an answer is cut and never what is in it, and a chunking
     * that dropped a paragraph or read one twice would sail through the counts.
     *
     * The model, the three chats and the workspace's own setting are put back
     * afterwards.
     */
  },
  {
    name: 'agent-jump-check',
    what: "the ways out of an agent's settings to the model, catalogs, tools and servers it names",
    needs: ['workflow'],
    /*
     * Issue #251, filed as "yet another missing link in agent settings" - and
     * the "yet another" is why this drives all five rather than the one that
     * was reported. Every other form that names a definition had been given the
     * mark, one report at a time; this one named a model, three kinds of grant
     * and an MCP server, and pointed at none of them.
     *
     * Two assertions could not be taken on trust. A grant row is a checkbox in
     * a label, so it presses the mark and asserts the grant did not change - a
     * link put inside that label would turn going to read what a tool does into
     * granting it. And it follows a memory catalog's mark to the end, because a
     * catalog is not a page of its own: the link carries which one it means,
     * and the screen at the other end has to open on that one rather than on
     * whichever is first.
     *
     * Both frames, for the reason agent-grants-check gives - the two marks that
     * sit beside a label are painted with class names the frame hands in, so a
     * frame that forgot one is a form with no way out in half the places it is
     * shown. It makes one MCP server to name and removes it; the agent is never
     * saved.
     */
  },
  {
    name: 'workspace-selector-check',
    what: 'a workspace created from the admin screen reaching the selector without a reload',
    needs: ['workspace'],
    /*
     * Issue #302, reported as the selector never appearing after the first
     * workspace was made. Dropping the cached list was already done on a create
     * and was not enough: it makes the next mount fetch again, and creating
     * from the admin screen navigates nowhere, so the selector already on
     * screen kept the list it had at page load - empty, on a fresh install -
     * and it draws nothing when no workspace in its list is the selected one.
     *
     * The reported case cannot be staged against a fixture that has
     * workspaces, so the same defect is staged one along: make one, and it has
     * to appear without a reload. A reload afterwards is the control.
     */
  },
  {
    name: 'workflow-jump-check',
    what: "the way from a workflow's settings through to its graph",
    needs: ['workflow'],
    /*
     * Issue #304, and the same complaint as every other jump check: a workflow
     * is two pages, and the settings page pointed at neither the editor nor
     * anything else, so reaching the graph meant going back to the list and
     * finding the row again.
     *
     * Same tab, which is where this differs from `agent-jump-check`. Those
     * marks are references - go and read what this tool does - and open beside
     * a half-edited form rather than throwing it away. This is the other half
     * of the thing already open, and a workflow that ended up in two tabs of
     * itself is worse than the walk it saves.
     *
     * It presses the link rather than reading its href, because a link to a
     * route that draws nothing has a perfectly good href.
     */
  },
  {
    name: 'model-window-check',
    what: "a model's context window: set on the screen the refusal names, and read by what refused",
    needs: ['workspace'],
    /*
     * Issue #252. The application told people to set a context window on a
     * screen that could only print one - `updateModel` had been in the schema
     * the whole time with no form behind it - so a model discovered from a
     * provider, or added before anybody knew the number, was stuck at nothing
     * and every agent on it fell back to the built-in allowance.
     *
     * The assertion the rest is scaffolding for is the last one: the same model
     * is asked for a session memory budget before and after, and it has to come
     * back refused first, in the sentence that names this screen, and worked
     * out afterwards against the window that was typed. A form that stored this
     * somewhere of its own would pass everything else here.
     *
     * The other one worth having is that the model's prices survive the save.
     * `updateModel` replaces a model's details rather than patching them, so a
     * card that sent only its own two fields would silently clear the three it
     * does not show. It makes a provider and a model of its own and removes
     * them.
     */
  },
  {
    name: 'agent-grants-check',
    what: "an agent's grants: bounded, searchable, and explained behind a (?), on the page and in the panel",
    needs: ['workflow'],
    /*
     * Issues #172 and #173 over the same twenty rows of markup, so one check
     * rather than two runs of the same form.
     *
     * It measures both frames, which is the half that could not be taken on
     * trust: #149 made the settings page and the editor's left panel one
     * `AgentForm`, and the panel is 441px against the page's 1070px - a cap
     * that leaves one readable can leave the other a wall. Every assertion is
     * made twice, once in each.
     *
     * The bound is measured against what the rows wanted rather than against a
     * number: 1638px of tools inside a 240px box. Where a workspace has too few
     * tools or MCP servers to prove that with, it makes its own, and it sweeps
     * both those and any an earlier killed run left behind. It never presses
     * Save, so the agent it drives is read and not written.
     */
  },
  {
    name: 'param-panel-check',
    what: "the function editor's details panel: the row, the notch colour, the mark",
    needs: ['workspace'],
  },
  {
    name: 'leave-guard-check',
    what: 'the function editor asks before unsaved work is walked away from, and only then',
    needs: ['workspace'],
    /*
     * Builds and deletes a scratch function of its own, so no function anybody
     * else's check reads is edited by running this - and sweeps the ones an
     * earlier run was killed before deleting.
     */
  },
  {
    name: 'leave-guard-editors-check',
    what: 'the object, tool and skill editors ask the same, and only then',
    needs: ['workspace'],
    /*
     * Issue #138's other two editors, and the skill editor #159 found had been
     * left out of that list. Builds and deletes a scratch tool, object and
     * skill of its own - and sweeps the ones an earlier run was killed before
     * deleting - so nothing anybody else's check reads is edited by running it.
     * The same drill three times, because a guard that behaves differently on
     * pages of the same shape is three guards.
     */
  },
  {
    name: 'leave-guard-load-check',
    what: 'all four editors are clean the moment they have loaded, before anything is touched',
    needs: ['workspace'],
    /*
     * Issue #175. The two checks above assert the untouched case and both
     * passed while the function and tool editors were rewriting the code column
     * on load - because the components they build agree with their own details
     * panel, and nothing anybody actually stores does. So this one builds
     * components that do not: a function with two externals and a hand-written
     * parameter list, a tool whose parameter names an object. Built and deleted
     * over GraphQL, and swept when an earlier run was killed before deleting.
     */
  },
  {
    name: 'issue-leave-guard-check',
    what: 'an issue being written survives the workspace picker, or is asked about before it does not',
    needs: ['workspace'],
    /*
     * Issue #234. The form was the one editor in the product with no guard on
     * it, and the picker is the one exit no click listener can see - so this
     * drives the picker rather than a link, and measures the corner as well as
     * the address: a question answered with Cancel used to leave the select
     * naming a workspace nobody was in.
     *
     * Needs a second workspace to switch to and says so rather than passing
     * quietly when there is only one. Files and deletes issues of its own in
     * both, and sweeps what an earlier killed run left in either.
     */
  },
  {
    name: 'issue-label-guard-check',
    what: 'a label added to an issue and saved leaves nothing to be warned about',
    needs: ['workspace'],
    /*
     * Issue #282, and it is the guard's comparison rather than its exits. The
     * labels are a set the server hands back sorted and the box appends to what
     * is on screen, so comparing them position by position reported an issue as
     * unsaved for as long as it stayed open whenever a label was added that did
     * not sort last - and reopening it, which takes both sides from the same
     * answer, said nothing, which is what made it read as a ghost.
     *
     * Two labels are driven rather than one, because a label that sorts last
     * never reproduced it and a fix asserted only against that would pass
     * without doing anything. The third case adds a label and does not save it:
     * a comparison loose enough to end the false warning must not be so loose
     * that it stops noticing a real change.
     */
  },
  {
    name: 'label-recency-check',
    what: 'the labels offered under the label box are the ones lately used, first',
    needs: ['workspace'],
    /*
     * Issue #346. The box offers six, and a workspace anybody is using has more
     * than six labels - so the order decides whether the label being reached
     * for is on the screen at all. Alphabetical put this week's milestone
     * behind five labels last touched in March.
     *
     * Two labels are driven and they are named so that the alphabet and the
     * clock disagree: used first, sorts first. A pair the two orders agree
     * about would pass against either.
     *
     * Files two issues of its own and deletes them, and sweeps what an earlier
     * killed run left.
     */
  },
  {
    name: 'orknux-tool-switch-check',
    what: 'an orknux_ tool cycles Hide, Offer and Always on its own inside the Orknux access grant, and is locked while it is off',
    needs: ['workspace'],
    /* Asked for: the grant was all or nothing. */
  },
  {
    name: 'workflow-panel-width-check',
    what: "the workflow editor's Node Properties panel and settings drawers widen by dragging their edge, and the panel closes",
    needs: ['workspace'],
    /* Asked for: a fixed 280px was too narrow for a node with several questions. */
  },
  {
    name: 'grant-card-check',
    what: "a tool or skill on the agent page shows its summary on hover, and its name links to its page",
    needs: ['workspace'],
    /* Asked for: the native title was a slow grey line, and built-ins and plugin tools had none. */
  },
  {
    name: 'auto-refresh-default-check',
    what: 'a run and a session start refreshing every second, a list starts at Off, and a choice made is kept',
    needs: ['workspace'],
    /* Asked for: following a run meant switching auto-refresh on every time. */
  },
  {
    name: 'saved-colour-check',
    what: '"Saved." is the success green on Workspace Settings, as on every other page',
    needs: ['workspace'],
    /* Reported: it was drawn in the grey of "Not saved yet." there alone. */
  },
  {
    name: 'note-length-check',
    what: 'how long a note an agent writes to itself may be, set from Admin',
    needs: [],
    /*
     * It was five hundred characters, fixed, and an agent keeping track of a
     * long review was refused twice running for seven hundred.
     */
  },
  {
    name: 'tool-rounds-check',
    what: 'how many rounds of tool calls an agent gets, set from Admin and per agent',
    needs: ['workspace'],
    /*
     * It was eight, written into the code, and an agent holding twenty tools
     * spent three of them listing and loading before the work began - what came
     * back was "kept looking things up without reaching an answer", with
     * everything it had gathered thrown away.
     *
     * Two knobs, because one number is not right for both cases: the
     * installation's, which every agent follows, and an agent's own. Asserted
     * against the server rather than against the boxes, because a field that
     * shows a number and stores nothing is the failure this is for - and the
     * empty box is asserted too, since "follow the installation" is the half a
     * form that only ever sets a number could not say.
     *
     * Leaves the installation on the number it found.
     */
  },
  {
    name: 'agent-sleep-check',
    what: 'how long an agent may wait before it is asked again, and how many times',
    needs: [],
    /*
     * Issue #367. A turn could end two ways - an answer, or finish_answer - and
     * neither fits work that is not finished and is not failing either: a build
     * running, a colleague who has been asked, a job that lands at six. An agent
     * can now end its turn with a wake-up, and the step is started again when the
     * time is up.
     *
     * Both bounds are here because the dangerous one is not the first wait but
     * the twentieth: waiting is a decision the model takes again every time it
     * wakes. The two are typed and saved together, which is the case a page that
     * only ever wrote one number would get wrong, and the refusal is asked of
     * the server rather than typed, because the box's own min and max stop a
     * person before the bound behind the screen is reached.
     *
     * Leaves the installation on the numbers it found.
     */
  },
  {
    name: 'subagent-limit-check',
    what: 'how many other agents an agent may ask: the number the installation sets, and a workspace over it',
    needs: ['workspace'],
    /*
     * Issue #380. Each ask is a conversation of its own, started on the asking
     * model's say-so, so this is the bound on fan-out. What the count does to
     * an ask is pinned in SubagentLimitTest; this is the two doors - Admin's
     * box saves, the workspace's opens on the installation's number as its
     * placeholder, saves its own, and clears back - and the refusal, asked of
     * the server because the box's own bounds stop a person first.
     *
     * Leaves both on the numbers it found.
     */
  },
  {
    name: 'tool-budget-check',
    what: 'how many tools an agent carries, and which of them always travel',
    needs: ['workspace'],
    /*
     * Issue #372, past #368. That one was about surviving a hard limit - OpenAI
     * and Azure refuse a request over 128 tools; this is about the number below
     * it, where a model is already choosing from a list it cannot hold in mind.
     *
     * The eviction is ToolBudgetTest's. Measured here is the form, where the
     * ceiling and the marks are one decision: the count appears when a number
     * is typed and not before, and every row cycles Hide, Offer, Always - the
     * server's own tools included, which since #444 are rows of this list like
     * anything else, held Always by a fresh agent, and switched off by hiding
     * the row. The ones that come with a wider grant are rows too, read-only.
     *
     * Makes an agent and removes it.
     */
  },
  {
    name: 'voice-barge-in-check',
    what: 'how long somebody talks over an answer before it stops',
    needs: ['workspace'],
    /*
     * Issue #342. The microphone is held open while an answer is read aloud, so
     * what is said over one was always heard - what was missing is the answer
     * stopping, which is the one thing a person cannot do in a conversation:
     * say "no, not that" and be listened to.
     *
     * What is measured here is the decision around the loop - the bounds, and
     * that zero can be chosen, which is the setting that matters most because a
     * room with poor echo cancellation hears the panel's own voice and would
     * stop on every answer. The loop itself is voice-talk-over-check's.
     *
     * Leaves the workspace on the setting it found.
     */
  },
  {
    name: 'voice-cancel-waiting-check',
    what: 'In voice mode, Cancel takes back the message waiting for the next turn: it leaves the panel, is never sent, and the turn in flight goes on',
    needs: ['workspace'],
    /* Makes two models and a chat and removes them; puts the turn-taking back. */
  },
  {
    name: 'voice-talk-over-thinking-check',
    what: 'In voice mode, talking while the model thinks abandons the request and the words go next - unless the workspace turns that off on its Voice card',
    needs: ['workspace'],
    /* Makes two models and two chats and removes them; puts the turn-taking back. */
  },
  {
    name: 'voice-speed-check',
    what: 'Voice mode reads its answers at the speed picked in its panel, and the speed is kept in the browser',
    needs: ['workspace'],
    /* Makes two models and a chat and removes them; puts the turn-taking and the stored speed back. Issue #673. */
  },
  {
    name: 'voice-leave-check',
    what: 'In voice mode, switching chat while the model thinks asks for no interrupt, and pressing the circle does',
    needs: ['workspace'],
    /* Makes two models and two chats and removes them. Issue #615. */
  },
  {
    name: 'voice-mute-check',
    what: 'Voice mode mutes by a button and by the shortcut chosen in Preferences; muted, a voice moves nothing, is not transcribed and is not sent',
    needs: ['workspace'],
    /* Makes two models and a chat and removes them; puts the turn-taking and the shortcut back. */
  },
  {
    name: 'voice-talk-over-check',
    what: 'a voice over an answer stops it, and a cough over one does not',
    needs: ['workspace'],
    /*
     * Issue #342, reopened. The first build was only ever checked for its
     * setting, and the detector it shipped never fired for anybody: it wanted
     * half a second with no twenty-millisecond frame under the bar, and speech
     * dips under any bar between syllables. Without the fix this fails on the
     * answer never stopping.
     *
     * The microphone is a file Chromium is told to believe, written by the
     * check: a quarter-second cough, then four seconds of syllables with gaps
     * between them, both over an answer being read. What it cannot have is a
     * speaker - the answer is a silent clip - so a real room's echo is still
     * unmeasured. Stubs the ears, the mouth and the model like voice-queue-check,
     * removes what it made, and leaves the turn-taking setting as it found it.
     */
  },
  {
    name: 'session-removal-check',
    what: 'an installation that will not let a conversation be thrown away',
    needs: ['workspace'],
    /*
     * A session is the record of what an agent was asked and what it answered,
     * and on some installations that is the only account of a decision anybody
     * has. Removing one is a person tidying up - which is what it is for - but
     * where the record has to stand it is a hole somebody can put in it with one
     * press and no way back.
     *
     * The rule is SessionRemovalTest's. Measured here is the screen: the switch
     * is in Admin, and the control on a conversation appears and disappears with
     * it - left out where the door is closed rather than drawn and refused,
     * because a control that argues back is one somebody presses twice before
     * reading why. The server refuses it either way, which is asked of the API
     * because a screen is not a boundary.
     *
     * Leaves the installation on the setting it found.
     */
  },
  {
    name: 'chat-commands-check',
    what: 'what can be typed in a chat instead of said',
    needs: ['workspace'],
    /*
     * Issue #343. A chat is for asking an agent, and some of what people want
     * is not a question: start that workflow, file that as an issue. Either
     * meant leaving the conversation, finding the page and coming back - and the
     * conversation is where the reason lives, so what came back was somebody
     * retyping what they had just written.
     *
     * The catalogue is the server's, because Slack's own slash commands arrive
     * there with nothing of the browser about them; that half is ChatCommandsTest.
     * Measured here is what only a browser answers: the slash opens the menu at
     * the start of a line and not mid-sentence, and the first Enter completes
     * rather than runs - /workflow really runs it, and a menu that fired on the
     * keystroke that opened it would start things nobody had finished reading.
     *
     * Makes a chat and files one issue through a command, and sweeps both.
     */
  },
  {
    name: 'chat-skill-command-check',
    what: "a word starting with the workspace's command marker offers the skills, and Tab completes it in place",
    needs: ['workspace'],
    /*
     * Reads the marker off the server rather than assuming one, since it is a
     * setting. Makes a chat of its own and deletes it; changes no setting.
     */
  },
  {
    name: 'chat-progress-command-check',
    what: "a chat with an agent offers the progress commands in its command menu, read from the server's list",
    needs: ['workspace'],
    /* Makes a chat of its own with the workspace's first agent, and deletes it. */
  },

  {
    name: 'default-memory-catalog-check',
    what: 'every workspace has one memory catalog, and it stays',
    needs: ['workspace'],
    /*
     * A catalog is what an agent is granted and what a memory is filed into, so
     * a workspace with none has nowhere for either - memory_save refuses because
     * there is nothing to write to, and the two memory tools are not offered at
     * all. Making one was setup nobody is told about, before an agent could
     * remember anything.
     *
     * The rule is pinned in DefaultMemoryCatalogTest, which can make a workspace
     * and read the row back. What is measured here is the screen: the catalog
     * that cannot be deleted is drawn without a Delete rather than with one that
     * argues back, and Rename is still there - renaming is the whole way out of
     * a name nobody likes, and is why the mark is a flag and not the name.
     *
     * Makes nothing and removes nothing.
     */
  },
  {
    name: 'agent-ask-agent-check',
    what: 'an agent is given other agents to put a question to',
    needs: ['workspace'],
    /*
     * Issue #350. An agent needing work done in a system it holds no tools for
     * could be granted those tools as well - forty descriptions in its context,
     * and a chain of lookups before the work it was asked about begins - or hand
     * the job back. A specialist asked one question answers in a conversation of
     * its own, so what comes back is the answer rather than the working.
     *
     * The grant is asserted against the server rather than against the ticks,
     * and the two bounds with it: an agent cannot be given itself, and a refused
     * save leaves the grant it already had alone. Those are what stop this being
     * a way to spend money in a loop.
     *
     * Makes two agents and removes them.
     */
  },
  {
    name: 'go-to-sections-check',
    what: '"go to" reaches a part of a page, not only the page',
    needs: ['workspace'],
    /*
     * Issue #361. The box could reach a page or one of the workspace's own named
     * things, and everything between the two was invisible: the workspace's
     * secrets are under Variables and the marketplace is a tab of Plugins, both
     * one keystroke away once found and unfindable until then.
     *
     * Two shapes, measured separately because they arrive differently: a tab the
     * page already keeps in its address, and a heading reached by a fragment.
     * The fragment is the part that breaks quietly - the browser only scrolls to
     * one on a full page load, and a router navigation leaves the page where it
     * was - so the landing is asserted in pixels rather than by a row appearing.
     *
     * One of the three is on a page long enough to have somewhere to scroll to,
     * because the other two fit in a window and cannot fail that way.
     */
  },
  {
    name: 'plugin-secret-reveal-check',
    what: "a plugin's secret parameter can show what is being typed into it",
    needs: ['workspace'],
    // Loads a plugin, which is installation-wide, so it runs on its own.
    alone: true,
    /*
     * Issue #366. The box was a bare password input with nothing beside it, so
     * a key pasted with a character missing could not be checked before it was
     * saved - and the plugin that then refused to authenticate said nothing
     * about which of the two it was. Connections got this in #339 and the
     * variables page has it; this is the third place.
     *
     * The bound is what is measured as closely as the control: the eye is not
     * offered over an empty box, because the server never hands a stored secret
     * back and an eye promising one would be promising the one thing it cannot
     * give. Loads a plugin of its own with one secret parameter - a seeded
     * installation has none - types into it and clears it again; saves
     * nothing, and unloads the plugin afterwards.
     */
  },
  {
    name: 'usage-range-check',
    what: "the window a model's usage metrics are for, chosen on the page",
    needs: ['workspace'],
    ci: false,
    /*
     * Issue #370. Thirty days was fixed and nothing on the page could ask for
     * anything else, while every question people bring here is about a different
     * window: what yesterday's run cost, what was spent last month, whether the
     * spike on the 14th was this model.
     *
     * Driven against a model that has actually been used, because the figures
     * only draw where something was recorded - a model made for the check would
     * show the sentence saying nothing has called it, and the check would be
     * measuring that sentence. Nothing is written: there is no API that records
     * a call against a past day, and adding one so a check could stage a chart
     * would be a write path in the product that exists for the test. What lands
     * inside a window is pinned in ModelAPITest, which writes the rows directly.
     *
     * Not in CI for the same reason: a seeded installation has no model that
     * answers, so nothing there has ever been used, and the check would fail
     * on its first line. It runs on a developer's installation with a model
     * that has been called.
     *
     * Makes nothing and changes nothing.
     */
  },
  {
    name: 'validate-status-check',
    what: 'the Validate status says what it checked, beside the button that checks it',
    needs: ['workspace'],
    /*
     * The status read "Not checked yet." in a footer, and the owner asked what
     * it meant. It is measured on all four editors that have a Validate button,
     * in all three of its states, and the distance to the button is measured in
     * pixels rather than read off the markup - "beside" is a distance. The
     * function editor's two panel paragraphs, moved behind a (?) on their
     * headings in the same pass, are asserted here too, along with the
     * "Open Variables" link that stayed in the open because a (?) that swallows
     * a navigation control makes the control unreachable.
     */
  },
  {
    name: 'split-check',
    what: "the function editor's split drags, survives a reload, and remeasures Monaco",
    needs: ['workspace'],
  },
  {
    name: 'typing-race-check',
    what: 'typing fast comes out character for character, and the four things allowed to overwrite it still can',
    needs: ['workspace'],
    /*
     * Issue #198. `CodeEditor` wrote its model back from its `value` prop
     * whenever the two differed, which for an editor is a race rather than a
     * rule: a passive effect runs after paint, so a keystroke landing in that
     * gap left it writing the text from one character ago back over the model
     * and sending the caret home. Typed at 15ms a key, an ordinary line came out
     * as "';n 'o' retu) 4154262ion1787".
     *
     * The delay is the whole point of this one. Playwright's default typing
     * speed is slower than a person's and does not reproduce it - which is how
     * every other check that drives this editor went on passing while real text
     * was being scrambled - so it types at 15ms and compares the whole string.
     *
     * The other half is what a fix could quietly break. Four things legitimately
     * write into this editor through that same prop - the panel rewriting a
     * declaration when a parameter is added, an accepted suggestion, a revision
     * restored from the History panel, another function opened - and all four
     * are driven here, along with the case #175 was about: a load rewrites
     * nothing.
     */
  },
  {
    name: 'tool-signature-check',
    what: "a tool's signature is editable, follows into the code column, and sticks",
    needs: ['workspace'],
    // Builds and deletes a scratch tool of its own, so nothing else is edited.
  },
  {
    name: 'function-run-check',
    what: 'running a function from its editor, with parameters, and reading what came back',
    needs: ['workspace'],
    /*
     * Issue #266. Validate answered whether the parser accepts the text, which
     * is not the question anybody has; this is the one that runs it.
     *
     * What earns it a place is the two halves a "does it work" button gets
     * wrong. The function is granted one of the workspace's variables and the
     * value of it is asserted in what came back, because a run that resolved no
     * grant would still *succeed* and answer wrongly - #142 all over again, on a
     * path that did not exist when #142 was fixed. And the same function is then
     * edited to throw and run again: a panel that can only report success proves
     * nothing, and the reason it prints has to be the sentence a workflow's own
     * run history would have printed.
     *
     * It also reads the audit. A test run is the one execution that leaves no
     * run behind it, so the audit entry is the only thing that can ever say it
     * happened - and a fix that dropped it would be invisible everywhere else.
     *
     * Its own function, variable and catalog, made and deleted over GraphQL, and
     * swept at the start in case an earlier run was killed before it could.
     */
  },
  {
    name: 'connection-parameter-check',
    what: 'a parameter declared as a connection: picked on both screens, and handed over as its id',
    needs: ['workspace'],
    /*
     * The type was added so a function could be handed one of the workspace's
     * connections and pass it to `orknux.slack.thread`. Adding it to the Kotlin
     * enum, the GraphQL schema and the editor's declarations left three places
     * still treating it as a shape nobody had thought about - and the first of
     * them, two CHECK constraints listing the types by hand, reached somebody as
     * a stack trace. That half is guarded in Kotlin by `ParameterTypeTest`; the
     * two screens are guarded here.
     *
     * What earns it a place is the assertion in the middle. A picker offering
     * the right names and writing the wrong value photographs identically to one
     * that works, so the function returns the argument it was given and the id
     * is compared - as a string, which is the shape a trigger publishes and the
     * shape the call is documented to take.
     *
     * It does not read a Slack thread. This machine has no Slack to read one
     * from, and a check that needed one would be a check that runs only where
     * somebody has set one up; what the call needs from these screens is the
     * connection, so the connection is what is measured.
     *
     * Its own function and connection, made and deleted over GraphQL, and swept
     * at the start in case an earlier run was killed before it could.
     */
  },
  {
    name: 'rename-declaration-check',
    what: "renaming a function follows into the code, and only where it is the editor's own name to change",
    needs: ['workspace'],
    /*
     * Issue #267. The panel already rewrote the parameter list of the
     * declaration and left the name of the same declaration behind, so a
     * renamed function went on declaring the old name for ever.
     *
     * Three of its four functions exist to watch the *refusals*, which is where
     * a fix like this does damage: a declaration somebody named themselves is
     * never touched, a function that calls itself by name is left whole rather
     * than half-renamed, and opening one whose name and declaration already
     * disagree - the state the defect leaves behind on any installation that has
     * been running - rewrites nothing and opens with nothing to lose. That last
     * one is issue #175's failure in new clothes, so it is asked of the unsaved
     * dialog and of the browser's own beforeunload, exactly as #175's check asks
     * it.
     */
  },
  {
    name: 'import-await-check',
    what: 'the editor says an imported function hands back a promise, and minds a missing await',
    needs: ['nothing'],
    /*
     * A function is stored as `export default async function` and an imported
     * one is called directly, so `imports.f(1)` is a promise - and it was
     * annotated as the bare return type. `const x = imports.f(1)` compiled
     * clean and handed somebody a promise at run time, which is worse than
     * either an error or silence.
     *
     * It drives nothing, because there is nothing to drive: `importTypes` is
     * imports in and a declaration file out, and the thing worth asserting
     * about that file is what TypeScript makes of it. So it compiles a call
     * against the declaration twice, with `await` and without, using the
     * options `components/monaco.ts` gives the editor - the same compiler
     * reaching the same verdict a hover would have shown.
     */
  },
  {
    name: 'active-badge-check',
    what: 'pressing Active/Inactive keeps the draft on screen, on both editors that draw it',
    needs: ['workspace'],
    /*
     * Issue #155. The badge sent `setEnabled` and put the whole answer through
     * the same `apply()` the page loads with, so a draft in the code column was
     * replaced by the stored copy the moment somebody pressed it. #138's leave
     * guard is about navigating and does not fire here - correctly; a press is
     * not a navigation.
     *
     * Measures the tool editor and the skill editor, which drew the same badge
     * over the same shape of draft. It asks the tool editor whether it is still
     * dirty afterwards and does not ask the skill editor, because the skill
     * editor has no leave guard to ask - #138 never named it. Builds and deletes
     * a scratch tool and a scratch skill of its own, and sweeps the ones an
     * earlier run was killed before deleting.
     */
  },
  {
    name: 'preferences-check',
    what: 'User Preferences reaches its own end and leaves room under it',
    needs: ['session'],
  },
  {
    name: 'chat-cost-check',
    what: 'the switch that puts what an answer cost beside how long it took, off until it is turned on',
    needs: ['session'],
    /*
     * The other half of #227. The number is the server's and `ChatCostTest`
     * pins it - onto the answer, added up over an agent's rounds, costed at the
     * model's prices and left uncosted where it has none. What that cannot see
     * is the control.
     *
     * The assertion that earns it a place is the second visit, in a browser
     * context that has never seen the first: a setting kept in local storage and
     * a setting kept on `app_user` look identical after a reload, and only a
     * fresh cookie jar tells them apart. That distinction is the reason this is
     * a column at all, so it is the one worth a check. Beside it, that the
     * switch starts off - the issue asked for a setting to turn the cost on -
     * and that the explanation of which rounds are counted is behind the (?)
     * rather than printed under the label, measured by the label being drawn on
     * one line.
     *
     * Alice's switch is put back off at the end.
     */
  },
  {
    name: 'chat-total-check',
    what: "a chat's own total growing across two turns and still being there after a reload",
    needs: ['model'],
    ci: false,
    /*
     * The half of the running total that no test on the server can reach.
     * `ChatCostTest` pins the arithmetic - added up across turns, both takes of
     * a regenerate counted, a refused turn adding nothing, an agent's rounds in
     * - and every one of those assertions would pass just as well against a
     * total held in the tab, which is precisely what this replaced.
     *
     * So the assertion that earns it a place is the reload: the page is loaded
     * again from nothing and the same figure is read back off it, to the token.
     * Beside it, that a second turn adds to the number rather than replacing it,
     * which is the difference between a running total and what was there before
     * - `lastSpend` drew the newest answer's cost on the same line, so the
     * figure went up and down as the conversation went on while reading like a
     * bill. And that a chat nobody has spoken in draws no line at all: nought
     * means not recorded, and #227 got that right on the answer.
     *
     * `needs: ['model']` for the reason `chat-regenerate-check` gives - nothing
     * in the API writes a turn into Spring AI's store, so an answer needs a
     * model that answers, and CI has none. It makes its own two chats, deletes
     * them, and puts alice's switch back off.
     */
  },
  {
    name: 'loader-check',
    what: 'a slow load shows the mark, a finished one hides it, an empty list says so',
    needs: ['fixture'],
    /*
     * "executions list never settled" was the check's own fixture assumption,
     * not the screen's fault. It leaned on a sentence about one database -
     * *this workspace's runs are all older than a day, so the default range
     * loads to an empty list* - and waited for "No runs match those filters."
     * on a workspace whose runs are recent enough to be drawn. It settles on
     * either answer now, and makes its own empty list by answering the query
     * with nothing, so the half about a list that finished and has none in it
     * is measured rather than hoped for.
     *
     * What is left of the fixture is one run to open a detail screen on, which
     * the seed starts eight of. With none, it says so and fails on that rather
     * than throwing.
     */
  },
  {
    name: 'run-view-kept-check',
    what: "a run's canvas stays where somebody put it: through a refresh, a resize, and a browser reload",
    needs: ['workspace'],
    /*
     * The first framing path had learnt to stop once a hand was on the canvas;
     * a second, keyed on the nodes rebuilt by every refresh, had not - and a
     * reload started from nothing. The hand outranks both now and the
     * viewport is kept per run for the tab. The zoom is a synthetic pinch,
     * because a headless wheel does not reach d3-zoom. Changes nothing.
     */
  },
  {
    name: 'scratchpad-budget-check',
    what: 'Admin Settings sets how many bytes a session\'s scratchpads may hold, in KB, and the server keeps it in bytes',
    needs: ['workspace'],
    /*
     * Issue #411. The field is in kilobytes and the server keeps bytes; this
     * checks the two agree and the box round-trips. What the bound does to a
     * write is ScratchpadTest's business. Leaves the setting as it found it.
     */
  },
  {
    name: 'workspace-settings-save-check',
    what: 'the workspace settings page saves from its header, with the note beside the button',
    needs: ['workspace'],
    /* Issue #452; #386's shape, arrived at the one page it had missed. */
  },
  {
    name: 'tools-named-check',
    what: 'Admin Settings sets up to how many findable tools find_tools names outright',
    needs: ['workspace'],
    /*
     * Issue #442. The number was in the source; now it is a box. What the
     * number does to find_tools is ToolSearchTest's business. Leaves the
     * setting as it found it.
     */
  },
  {
    name: 'limits-check',
    what: 'Admin Settings draws a box for every number the server lists under Limits, saves one, refuses out of range and goes back to the default',
    needs: ['session'],
    /*
     * Issue #453. The list is the server's, so the box count is measured
     * against what it answers rather than a number written here. Leaves the
     * number it changes as it found it.
     */
  },
  {
    name: 'sessions-list-columns-check',
    what: 'the sessions list shows a green dot for an active session, a count of the subagents each fanned out into, and catches up on Refresh and Auto',
    needs: ['workspace'],
    /*
     * Issues #403, #404. The rows are a fixture: what makes a session active
     * and what its subagent count is are LlmSessionTest's business. Here the
     * dot lights for the active row and not the quiet one, and the count reads
     * where there is one. Changes nothing.
     */
  },
  {
    name: 'workflow-editor-refresh-check',
    what: "the workflow editor's Refresh reads the graph and the pickers again, saving what was not sent yet first",
    needs: ['workspace'],
    // Adds a node to the workspace's workflow; the runner puts the workflow back after it.
  },
  {
    name: 'sessions-spend-columns-check',
    what: "the sessions list shows each session's tokens and cost, a dash where there is none, and sorts by either",
    needs: ['workspace'],
    /*
     * The rows are a fixture: what a session's spend adds up to and the server's
     * TOKENS and COST orders are SessionSpendTest's business. Changes nothing.
     */
  },
  {
    name: 'run-step-session-link-check',
    what: 'an agent step on a run links to the session it kept, and a step that kept none links nowhere',
    needs: ['workspace'],
    /*
     * Issue #387. The run is a fixture and only its two agent steps matter:
     * one carries a sessionId and shows an Open session link to it, the other
     * carries none and shows nothing. What fills that field on a real run is
     * AgentNodeRunnerTest's business. Changes nothing.
     */
  },
  {
    name: 'run-graph-check',
    what: "the run's graph stays on the canvas, including while the run is read again",
    needs: ['fixture'],
    /*
     * Issue #235, and the order it forces. The report is that the graph is
     * sometimes empty on load, which is a race - twice in twenty cold loads
     * here - so waiting for it would be a check that certifies nothing. What
     * this drives instead is the thing the race is between: reading the run
     * again replaced every node object, React Flow dropped every measurement it
     * had, and an unmeasured node is drawn `visibility: hidden`. That blanked
     * the whole graph for a frame every single time, and it is the frame after
     * it that is up to the machine.
     *
     * So it watches the canvas every animation frame across a Refresh rather
     * than reading it once when the dust has settled. Needs one run with steps
     * in it, which it finds rather than starts.
     */
  },
  {
    name: 'run-panels-check',
    what: "the run page's graph, log and node rail, each dragged to a size and each keeping it",
    needs: ['fixture'],
    /*
     * Issue #434. Three windows onto things much bigger than the window - a whole
     * run's shape in 332px, a log of very long lines four at a time, a step's
     * JSON and its picture in 390px - and none of them could be made bigger.
     *
     * Drives all three handles: the two heights by their bottom edge, the rail by
     * its left edge with the main column giving way. What it is really for is the
     * three things a drag quietly stops doing - the floor and the ceiling, the
     * size surviving a reload per panel, and the handle answering arrows - plus
     * the one thing peculiar to this page, that React Flow fills the box rather
     * than being clipped by it. Needs one run with steps in it, which it finds
     * rather than starts, and changes nothing but this browser's own storage.
     */
  },
  {
    name: 'run-sections-collapse-check',
    what: "the run page's summary, graph and log fold to their headings, stay folded, and the graph comes back drawn",
    needs: ['fixture'],
    /*
     * Each section folds by a chevron button at its heading and is remembered
     * for every run. The graph is the one with something to go wrong: folded,
     * its canvas is unmounted, and a React Flow canvas that mounts without its
     * measurements draws hidden boxes and no lines - so the boxes and lines are
     * measured after unfolding, not just counted. Also folds a step's input and
     * output in the rail. Needs one run whose steps are joined by a line, which
     * it finds rather than starts; changes nothing but this browser's storage.
     */
  },
  {
    name: 'graph-lines-check',
    what: 'the lines between the boxes stay drawn, on the run page and in the editor',
    needs: ['fixture', 'workflow'],
    /*
     * Issue #259, and what #235 and #242 left behind. Those two were about a
     * node React Flow had no measurement for, which it draws invisible, and
     * both were fixed by saying how big a node is before anything measures one.
     * A line is not drawn from a node's size, though - it is drawn from where
     * the node's handles are, which React Flow carries across a rebuild only
     * for a node whose object says `measured`. So the boxes came back and the
     * lines did not: every step on the canvas and nothing joining any of them,
     * which is what was reported.
     *
     * The same race decides whether it recovers, so what is driven is the thing
     * the race is between - the frame in which the lines are not drawn, which
     * happened on every read of a run and every Discard in the editor before
     * the fix. Watched every animation frame, on both canvases, because one
     * page's fix has twice now not been the other's.
     *
     * How many lines to expect comes from the run rather than the canvas: a
     * canvas drawing none would otherwise agree with itself.
     */
  },
  {
    name: 'run-travelled-lines-check',
    what: "on a run's canvas the lines the run travelled are green, in both themes, and a branch it did not take stays grey",
    needs: [],
    /* Makes a condition and a workflow of its own, runs it, and removes both. */
  },
  {
    name: 'issue-types-check',
    what: 'a workspace adds a type, the list filters by it and by Untyped, and one in use will not delete',
    needs: ['workspace'],
    /*
     * Issue #241. A type is the one thing about an issue that a label could not
     * have been: a set cannot say "exactly one", and a label exists only while
     * an issue carries it, so there was nothing for a settings page to hold.
     *
     * The refusal is what this drives in a browser rather than leaving to the
     * server tests. The whole of it is that an administrator is told before and
     * after - the count sits on the row, and the sentence that comes back names
     * how many rather than being rephrased into "Could not delete" on the way
     * through the page. Both of those are the interface's to get wrong.
     *
     * Untyped is asked for as well, and deliberately: it is the state most of a
     * tracker is in on the day types arrive, and a filter that could only say
     * "this type" or "never mind" would have left it unaskable.
     */
  },
  {
    name: 'issue-label-filter-check',
    what: 'a label chip narrows the issues to the ones carrying it, not the ones mentioning it',
    needs: ['workspace'],
    /*
     * Issue #610. The chip typed itself into the search, which reads the
     * title and the description too, so an issue that only named the label in
     * its text came back under it. Files its own two issues and deletes them.
     */
  },
  {
    name: 'issue-filters-back-check',
    what: 'the way out of an issue returns to the list somebody was on, filters and all',
    needs: ['workspace'],
    /*
     * Issue #317. The filters live in the address on purpose - that is what
     * makes "the open p1 ones" a link rather than a sentence - but every way
     * out of an issue named the list by its bare address, so filtering a
     * tracker down and opening one of the results put you back at Open, newest
     * first with the filtering to do again.
     *
     * The two assertions worth the check are the count and the refresh. The
     * count, because the seeded issue is on the unfiltered list too: finding it
     * proves the page drew and nothing more, and only ten rows against two says
     * which list came back. The refresh, because the filters ride on the
     * history entry rather than in the issue's own URL - an issue's address is
     * what people paste to each other - and an entry that did not survive a
     * reload would be a fix that held until somebody pressed F5.
     *
     * The last phase is the half a fix could quietly break: an issue opened by
     * its own address still has an arrow, and it goes to the bare list.
     */
  },
  {
    name: 'delete-issue-check',
    what: 'the trash asks before it deletes, and the issue is really gone after',
    needs: ['workspace'],
  },
  {
    name: 'issue-statuses-check',
    what: 'a status the workspace adds reaches the settings card, the filter bar and the status button',
    needs: ['workspace'],
    /*
     * Issue #428. It adds a status of its own, files an issue to walk through
     * it, and takes both away again, so the seeded fixture is as it was.
     */
  },
  {
    name: 'remove-comment-check',
    what: 'a comment comes off a thread, without the question quoting it back or the history losing it',
    needs: ['workspace'],
    /*
     * Issue #276. Three of its assertions could not be made anywhere but in a
     * browser, and the server suite already covers everything else.
     *
     * The dialog must not repeat what the comment said. That is a product
     * decision invisible to any test of the mutation, and it is the one most
     * likely to be undone by somebody making the question "clearer": the reason
     * a comment is usually being removed is that those exact words should not be
     * in front of anybody.
     *
     * The history entry must read as a removal. `said()` falls through to
     * "commented" for a kind nobody wrote a sentence for, so an unhandled event
     * renders as the opposite of what happened, perfectly, with no error
     * anywhere. It is counted rather than matched - one comment is left, so one
     * "commented" line - because the fallthrough produces a second one.
     *
     * And the words are asked for again over GraphQL after the fact, as the
     * whole issue, so a tombstone the interface merely hides fails here while
     * passing everything about the thread.
     *
     * Files and deletes an issue of its own, and sweeps what an earlier killed
     * run left behind.
     */
  },
  {
    name: 'new-issue-blank-check',
    what: 'a new issue starts empty however it was reached, and a run of them still keeps its labels',
    needs: ['workspace'],
    /*
     * Issue #238: Quick actions opened the new-issue form filled in with the
     * issue that was being read. Everything here is driven through the palette
     * rather than through an address, because that is the only way to reproduce
     * it at all - the defect lives in one running page, and a reload mounts a
     * clean one.
     *
     * The three "File another" assertions look like they belong to another
     * check and do not: they are what stops this one being fixed by clearing
     * the form on mount, which would take the labels off the second issue of a
     * run somebody is filing. Both halves have to be held at once.
     *
     * Files and deletes issues of its own, and sweeps what an earlier killed
     * run left behind.
     */
  },
  {
    name: 'workflow-list-check',
    what: 'the workflow list shows X at a time and orders the whole list, not the page',
    needs: ['workspace'],
    /*
     * It tops the workspace up to twelve workflows of its own and removes them
     * again, so the only thing it wants from the fixture is runs: two workflows
     * that have run, so that "by last run" has something to put in order and a
     * never-run row to keep last. The seed runs two, so this is in.
     */
  },
  {
    name: 'workflow-header-check',
    what: 'the workflow list orders and acts on one header row, and its columns name workflows',
    needs: ['workspace'],
    /*
     * Issue #174, and the assertion at its centre is a measurement rather than
     * a photograph: the sort control and the four buttons beside it have to
     * share a row, which is their vertical centres inside two pixels of each
     * other. Wants only workflows the workspace already has - two of them, so
     * that reversing the order has something to reverse.
     */
  },
  {
    name: 'removed-workflow-check',
    what: 'a run of a removed workflow can be filtered to, and its workflow is named rather than linked',
    needs: ['workspace'],
    /*
     * Issue #168, both halves against the same run: the Workflow filter offers
     * the workflow the run names even though the workspace no longer lists it,
     * and the row and the run's page name that workflow without offering the
     * editor link that answered "No workflow assignment with id 373". A run of
     * an assigned workflow is measured beside it, because a page that linked
     * nowhere at all would satisfy the first half and be worse than the bug.
     *
     * Its fixture is one workflow it creates, runs once and unassigns - and
     * then finds again on every later run rather than making another. Nothing
     * deletes a run or a workflow definition, so a check that built a fresh one
     * each time would grow the database of every workspace it is pointed at,
     * which is the thing issue #168 was written beside.
     */
  },
  {
    name: 'pagination-footer-check',
    what: 'every paginated list names its own rows, in the footer and in the row of columns over it',
    needs: ['workspace'],
    /*
     * Wants nothing built for it. Every list it opens is one the workspace
     * already has, and the half that matters most - which noun each call site
     * hands the shared footer - is read out of `src/` and needs no database at
     * all. A list the workspace happens to have none of is allowed to draw no
     * footer, but only two of them, so an empty workspace cannot pass this.
     */
  },
  {
    name: 'catalogue-failure-check',
    what: 'a catalogue that failed to load says so, where an empty one says it is empty',
    needs: ['workspace'],
    /*
     * Issue 139. Needs nothing of the catalogues it is about: it answers their
     * queries itself, once with an empty list and once with an error, and reads
     * what each of three screens says about each. The whole fixture is a
     * workspace with an agent in it - the seed makes two - and an administrator
     * to open the admin half, so it runs in CI.
     */
  },

  {
    name: 'value-condition-check',
    what: 'a value condition is made without a property, and the node picks the value with the ordinary reference row',
    needs: ['workspace'],
    /*
     * Issue #378. The typed conditions know where their subject is; a VALUE
     * condition is told by the node, under the argument name `value`, with
     * the same picker a function's parameters get. Two halves: the settings
     * form, and the row on the node whose reference lands on the node.
     */
  },

  {
    name: 'login-reset-link-check',
    what: 'the sign-in page offers a password reset only where the installation keeps the passwords',
    needs: [],
    /*
     * Issue #382. Under a directory sign-in the Reset link beside the password
     * box led to a page that could do nothing about a directory's password.
     * The auth method is stubbed at the browser, both ways, because the
     * installation under test signs in one way and this is about the other.
     */
  },
  {
    name: 'skill-id-check',
    what: 'every skill has an id, derived from its name, drawn on its card and edited under the rule',
    needs: ['workspace'],
    /*
     * Issue #381. What the rule refuses is pinned in SkillIdTest; this is the
     * screen: the id derived when a skill is made, the card showing it, and
     * the editor refusing a bad one in words where it was typed.
     *
     * Makes one skill and removes it.
     */
  },
  {
    name: 'command-marker-check',
    what: "what marks a command in a message is a box on the workspace's settings",
    needs: ['workspace'],
    /*
     * Issue #381. The parse is pinned in CommandsTest and the trigger test;
     * this is the box - opens on what is held, saves a change, refuses a
     * letter in words. Leaves the marker as it found it.
     */
  },
  {
    name: 'agent-skill-ids-check',
    what: 'an agent node names the skills to load, by id, and a written id that names nothing is refused',
    needs: ['workflow'],
    /*
     * Issue #381. The run's half - the skills loaded before the model starts,
     * the ids that name nothing noted - is ForcedSkillsTest's. This is the
     * editor: the skillIds row on a new agent node, what its empty state says,
     * and the save refused on the node for an id nothing answers to.
     *
     * Adds a node it never saves, so the fixture's graph is left as found.
     */
  },
  {
    name: 'variable-duplicate-check',
    what: 'a variable refused for its name says so under the row that asked, not at the top of the page',
    needs: ['workspace'],
    /*
     * The server always refused a duplicate name in one catalog, and the page
     * drew the refusal - one red line above the catalog's name, off the screen
     * from the add row at the foot of any real list. Michal added a duplicate
     * and saw nothing happen. The distance is what is measured: the refusal
     * lands within a row's height under the row it is about, and goes with
     * the row when the row is discarded.
     *
     * Makes one variable, tries it twice, and removes it.
     */
  },
  {
    name: 'variable-workspace-switch-check',
    what: "switching workspace on the variables page opens the other workspace's catalogs, refusing nothing",
    needs: ['workspace'],
    /*
     * The open catalog was a bare id that outlived the workspace it came from,
     * so a switch asked the new workspace for the old one's catalog and the
     * page said "No catalog with id". Asserts the other catalog is open too,
     * which a page that showed nothing would not pass.
     */
  },

  {
    name: 'variable-types-check',
    what: "a variable of a plugin's type gets the plugin's picker and its refusal, and a list is edited as one",
    needs: ['workspace'],
    /*
     * Issue #377. A Slack user id is a string only some values of are real,
     * and a variable holding one was a text box. The plugin here is a palette
     * rather than Slack, because what is measured is the screen and the round
     * trip - the type on the picker, the suggestions as you type, the refusal
     * with the plugin's own reason, the list stored as an array - and a type
     * that needs no network says all of that without one.
     */
  },

  {
    name: 'assigned-role-check',
    what: 'a role given to somebody on the Users screen is saved and comes back',
    needs: ['session'],
    /*
     * Issue #376. The checkboxes were drawn and locked for anybody the directory
     * vouches for - correctly at the time, since a role given there decided
     * nothing: every access question was answered from the provider's groups
     * alone, so the box would have saved a role, drawn it under the name, and
     * granted nothing.
     *
     * Whether such a role then opens a workspace is AssignedRoleTest's business.
     * This is the screen half.
     *
     * Leaves one scratch user behind: there is no mutation that removes one, and
     * there should not be.
     */
  },

  {
    name: 'role-directory-names-check',
    what: 'a role names the directory groups that grant it, on the screen rather than in a file',
    needs: ['session'],
    /*
     * Issue #375. A role matched to a group by its own name covers most
     * installations and falls down on the first group called `dev.TL`, and the
     * only answer was a mapping in the configuration file - which an
     * administrator can neither see nor change.
     *
     * The round trip rather than the box: a textarea that holds what was typed
     * and sends nothing looks perfect and grants nobody anything.
     */
  },

  {
    name: 'model-details-edit-check',
    what: "a model's name, model ID and type are boxes on its page, and Save stores them",
    needs: [],
  },

  {
    name: 'model-provider-move-check',
    what: "a model's provider is a select on its page, and Save moves the model to the one chosen",
    needs: [],
    /* The server half - the refusals across workspaces and onto a taken name - is ModelAPITest's. */
  },

  {
    name: 'model-reasoning-effort-check',
    what: "a chat model's page draws only the sampling and reasoning settings its provider reads - Azure: temperature, top-p, reasoning effort; Ollama: temperature, top-p; a llama.cpp server: all five - and Save stores them",
    needs: [],
    /* The refusals - a setting the provider does not read, a word off the list - are ModelChatParametersTest's. */
  },

  {
    name: 'speech-node-check',
    what: "the editor's Text to speech adds a node of that name on a Speak action, making the action where there is none",
    needs: [],
  },

  {
    name: 'duplicate-row-check',
    what: 'agents, model providers, models, actions, triggers, conditions, objects, skills, tools and memories each duplicate from their row',
    needs: [],
    /* The server half - the next free name, the same references - is ComponentDuplicateTest's. */
  },

  {
    name: 'workspace-copy-progress-check',
    what: 'duplicating a workspace shows the kind under way, how many of how many, and a bar that moves',
    needs: [],
    /* Issue #572. The server half - a step after each component - is WorkspaceDuplicateTest's. */
  },
  {
    name: 'workspace-export-check',
    what: 'a workspace exported from its row and imported from the header comes back as a new workspace, with the result drawn',
    needs: [],
    /* Issue #590. Makes and deletes its own workspaces; the round trip field by field is WorkspaceExportTest's. */
  },

  {
    name: 'built-in-skills-reach-check',
    what: 'an agent with no skill catalog still holds the skill tools and the built-in catalog, drawn ticked and fixed - and a save no longer sends it, while its skills still switch',
    needs: [],
    /*
     * Reported: the skill tools followed the catalog grants, so an agent with
     * none could not load even !caveman. The server half is SkillIdTest's.
     * And for an agent that had the catalog's name stored from before the
     * server granted it to everyone: the row reads the same, says why on the
     * row, and the form's save drops the name.
     */
  },

  {
    name: 'unsafe-built-ins-save-check',
    what: "the workspace's unsafe built-in visibility switch is stored, and a reload draws it as stored",
    needs: [],
    /*
     * Reported as not saving. It did save: the page's first load set every draft
     * but this one, so the switch opened off whatever the server held.
     */
  },

  {
    name: 'session-export-csv-check',
    what: 'a session page offers its whole transcript as a CSV download, narrowed by the search it is filtering with',
    needs: ['session'],
  },

  {
    name: 'session-notes-check',
    what: 'a session draws what its agents wrote down for themselves, as lines of its log where they were written',
    needs: ['session'],
    /*
     * Issue #371. What is kept and what is refused is pinned in NoteToSelfTest;
     * this is the other end - that LlmSession still serves `notes`, and that a
     * session carrying them draws them.
     *
     * The field is asked of the running server and only the notes themselves are
     * stubbed, because a note exists because a model called `note_to_self` and
     * there is no mutation that writes one. Asking a provider to use a tool on
     * cue would make this a measurement of the provider's mood; asking the
     * server for its schema does not.
     *
     * 'session' rather than 'workspace': it makes nothing, so an account is the
     * whole of what it needs.
     */
  },

  {
    name: 'session-family-check',
    what: 'a session lists its family from the top right and switches between them, the panel kept open',
    needs: ['session'],
    /*
     * Issue #379. What is kept - a session under the one that asked, titled
     * with the task, active while an agent is at work in it - is pinned in
     * SubagentSessionTest; this is the other end: Query still serves
     * llmSessionFamily with what the panel draws, and a family put in front
     * of the page comes out as the main session first, each subagent by its
     * task, a dot each, and a click that swaps the transcript on the left.
     *
     * The members are stubbed for the same reason the notes are in
     * session-notes-check: a subagent session exists because a model called
     * ask_agent, and no mutation makes one.
     */
  },

  {
    name: 'session-pages-check',
    what: 'the sessions list narrows, a transcript filters and reorders, and a session takes two presses to remove',
    needs: ['workspace'],
    /*
     * Issue #158. Both pages were built by #119 and neither was opened by
     * anything here; `screenshots.mjs` photographs them for the manual, which is
     * why they looked covered.
     *
     * It builds its own fixture the only way a session can be built - there is
     * no mutation that makes one, and there should not be: a session exists
     * because an agent node carrying a `sessionKey` ran. So it makes a scratch
     * workflow of a session node wired to whichever agent has a model, runs it
     * three times over two keys, and removes the sessions and the workflow
     * afterwards.
     *
     * 'workspace' rather than 'model', because it does not need a model that
     * answers: the question is written into the session before the model is
     * asked and an answer that never comes is recorded as a system note, so the
     * transcript holds two kinds either way. Which two is read back off the
     * server and every assertion is made against that, so the check says the
     * same thing here and in CI.
     *
     * The one thing it cannot sweep is the three executions the runs leave -
     * nothing removes an execution, and `removeWorkflow` leaves them behind.
     */
  },

  {
    name: 'session-agent-details-check',
    what: "a session's log draws each agent's setup where that agent started answering, and only where it changed",
    needs: ['workspace'],
    /*
     * Issues #391 and #441. What is written - a line where the setup answering
     * differs from the last one logged, none where it is the same - is pinned in
     * AgentNodeRunnerTest; this is the other end, against a real session: two
     * scratch agents take turns in one session over three runs, the server holds
     * two AGENT_DETAILS lines in their order, and the page draws a collapsed
     * block at each, in order, opening on a press.
     *
     * The fixture is built the way session-pages-check builds its own, and for
     * the same reason it needs no model that answers: the setup is written into
     * the session before the model is asked. 'workspace' rather than 'model'.
     */
  },

  {
    name: 'scratchpad-editor-check',
    what: 'a scratchpad opens as a document in the room the page has left, with Delete and Save beside its name',
    needs: ['workspace'],
    /*
     * Issue #457. The editor was 360px of a document in a 900px window, with the
     * two acts on the file in a bar underneath it. Both halves are measured
     * rather than asserted to have changed: the height against the room between
     * the editor's top and the foot of the window, in four window sizes and at
     * phone width, because a constant in the stylesheet passes in the one window
     * it was written for and fails in every other;
     * and the controls by where they are drawn, above the box and to the right of
     * the file's name, with nothing pressable left below it.
     *
     * It borrows the newest session the workspace has and makes a scratchpad in
     * it, rather than running a workflow to produce a session of its own the way
     * session-pages-check does: what is being measured is the shape of the
     * editor, and any session draws it. The pad is removed afterwards, and any
     * pad of its own left by a run that died is swept first.
     */
  },

  {
    name: 'copy-fallback-check',
    what: 'a copy button puts the text on the clipboard from a plain-http origin, and says Copied',
    needs: ['workspace'],
    /*
     * Issue #589. Reads the chat the seed builds and copies its first sent
     * message. The page is made a plain-http origin before it loads where the
     * suite runs against localhost, so the fallback is measured in CI too; the
     * clipboard is read back from a page at localhost, which may read it.
     */
  },
  {
    name: 'own-tokens-check',
    what: 'access tokens made, copied and revoked on Preferences and on the admin user page',
    needs: [],
    /*
     * Issue #2. Every token it makes it revokes. Where the account it signs in
     * as is a directory one, which may hold no tokens, Preferences is asserted
     * to draw no section, and the admin page half uses an internal user named
     * own-tokens-check, made the first time and found after.
     */
  },
  {
    name: 'chat-copy-check',
    what: "the copy control under the message it copies, on the bubble's edge and not the column's",
    needs: ['workspace'],
    /*
     * Reads the chat the seed builds, found by title rather than by id. It
     * asserts two things about one control because either alone passes for the
     * wrong reason: under the bubble, and sharing its right edge. The third is
     * that hovering reveals it, since a control that is always drawn would pass
     * the first two without anything having been fixed.
     */
  },
  {
    name: 'chat-copy-answer-check',
    what: 'the sent message and the answer hide and show their copy control by the same rule',
    needs: ['model'],
    ci: false,
    /*
     * The other half of issue #188, split off because it needs an answer to
     * measure and the check it came from does not.
     *
     * On 2026-08-22 this was one check, and the first CI run of the browser job
     * failed it: a seeded installation has no model it can reach, so its chats
     * are a question with nothing after it, and the wait for `Copy this answer`
     * timed out and reported the *sent* control as broken. Three assertions
     * that CI can prove were being lost to a fourth it never can.
     *
     * Naming the gap rather than hiding it: nothing unattended proves the
     * answer side. Closing it needs a fixture with a stored answer, which needs
     * either a model CI can reach or a way to write a turn without one.
     */
  },
  {
    name: 'chat-regenerate-check',
    what: 'asking the last answer again, and the answer it replaced still being there',
    needs: ['model'],
    ci: false,
    /*
     * Issue #245. The assertions are mostly about the *old* answer, because
     * that is the part a regenerate is easy to get wrong: take the answer off
     * the thread, put a new one there, and the answer somebody was about to
     * keep is gone with nothing to go back to. It steps back to it, and then
     * reloads and steps back to it again - which is what tells a take kept on
     * the server from one held in a tab.
     *
     * `needs: ['model']` for the reason `chat-copy-answer-check` gives: there
     * is no way to put an answer into a chat without one, since the thread is
     * Spring AI's store and nothing in the API writes a turn to it. What CI
     * does cover is the server half, in ChatRegenerateTest, on both engines.
     *
     * It was driven against a stub answering the OpenAI shape, whose every
     * answer is numbered - two answers to one question are otherwise
     * indistinguishable, and "the answer changed" is the assertion.
     */
  },
  {
    name: 'row-action-cursor-check',
    what: 'every icon control in a workflow row says it is clickable',
    needs: ['workspace'],
    /*
     * Reads every control in the Actions column rather than the one that was
     * reported. The fault was the shared class, not the button: two of the
     * three were wrong and the third only looked right because it is an
     * `<a href>`. Naming what it found means a fourth control added later is
     * covered without anybody editing the check.
     */
  },
  {
    name: 'prompt-padding-check',
    what: 'the system prompt box and the description box agree about their padding',
    needs: ['workspace'],
    /*
     * Agreement rather than a number, which is what issue #190 asked for: a
     * change to the shared class moves both and this still passes, while a
     * change that moves one of them is the bug it was written for. It measures
     * box edge to first line as well as the padding, because a box that centres
     * its contents pads correctly and still reads wrong - which is exactly what
     * was happening.
     */
  },

  // --- connections and transfer ---------------------------------------------
  {
    name: 'secret-reveal-check',
    what: 'one eye for every stored credential, and it hides again',
    needs: ['workspace'],
    /*
     * Issue #191. It asserts the three things that were wrong rather than that
     * a control exists: no text on it, an accessible name that changes with the
     * state, and a second press that puts the secret away - which the provider
     * and MCP forms could not do at all. It reads the variables page beside
     * them, since agreeing with that page is the whole request and a check that
     * only read what changed would pass while the two drifted apart again from
     * the other side.
     */
  },
  {
    name: 'provider-check-switch-check',
    what: 'a provider can be told the timed sweep is not to call it, and the button still can',
    needs: ['workspace'],
    /*
     * The sweep asks every configured provider every few minutes, which is
     * right for one an installation pays for and wrong for the endpoint
     * somebody keeps against a box that is only sometimes running: there it is
     * a failed row and a connection refused in the log every five minutes for a
     * state nobody thinks is wrong.
     *
     * `ProviderCheckSwitchTest` proves what the sweep does with the switch.
     * This proves somebody can reach it: the control on the provider's page,
     * pressed, saved, and read back off the server rather than off the screen -
     * because a toggle that paints itself and sends nothing is indistinguishable
     * from a working one until the page is reloaded, which is what this does
     * after every move. It also presses Test Connection with the switch off,
     * since a switch that stopped the button too would be a different feature.
     *
     * Its own provider, under a scratch name, pointed at a port nothing listens
     * on - which is the case it exists for - and removed at both ends.
     */
  },
  {
    name: 'provider-reasoning-switch-check',
    what: "a provider can be told to have the model's earlier thinking sent back, off by default",
    needs: ['workspace'],
    /*
     * Echoing a model's thinking back is what some providers need and others
     * drop - Gemma's template on llama.cpp - so it is the provider's switch,
     * off unless turned on. `ProviderSendsReasoningTest` and
     * `AgentToolCallTest` prove what is stored and what reaches the wire; this
     * proves somebody can reach it: drawn and off on a new provider's form, off
     * on one made without an opinion, and a press saved and read back off the
     * server and after a reload. Its own scratch provider, removed at both ends.
     */
  },

  {
    name: 'provider-tool-cap-check',
    what: 'a provider caps how many tools a request carries, and no provider offers every tool up front by default',
    needs: ['workspace'],
    /*
     * `ProviderToolCeilingTest` proves what reaches the wire; this proves All
     * tools up front is drawn off on a provider nobody set, and that the cap is
     * saved and read back off the server and after a reload, and put back
     * under the type. Scratch providers, removed at both ends.
     */
  },
  {
    name: 'provider-tool-loading-check',
    what: 'a provider offers All tools up front, off for every type, and joining loaded tools to the list, off for llama.cpp alone, with a one-line warning on llama.cpp when it is on',
    needs: ['workspace'],
    /*
     * A loaded tool joining the tool list makes llama.cpp read the whole
     * conversation again at the next turn, so the join is off there by
     * default and its cost is said under the switch once somebody turns it
     * on. `ProviderToolCeilingTest` and `StablePromptOnLoadTest` prove what
     * reaches the wire; this proves the defaults are drawn per type, the
     * warning appears only where it should and in its words, and both
     * switches are saved and read back off the server and after a reload.
     * Scratch providers, removed at both ends.
     */
  },
  {
    name: 'provider-chat-api-check',
    what: "an Azure OpenAI provider's chats go through Responses or chat completions, chosen on its page",
    needs: ['workspace'],
    /*
     * Azure's chat completions refuse a reasoning model its tools, so an Azure
     * provider speaks Responses by default and keeps chat completions on a
     * select to go back to. `ProviderChatApiTest` proves what is stored and
     * refused; this proves somebody can reach it: the select drawn for Azure
     * and for no other type, opening on what the provider holds, and a choice
     * saved and read back off the server and after a reload. It also saves an
     * OpenAI provider, since a form that always sent the choice could not.
     *
     * Its own providers, under scratch names at hosts that cannot resolve, with
     * the sweep off, removed at both ends.
     */
  },
  {
    name: 'provider-credential-check',
    what: "a provider's key is its own or a workspace secret it reads, and the two do not spill into each other",
    needs: ['workspace'],
    /*
     * Issue #232, and where the choice ended up. It was a pair of tabs above
     * the Authentication card, which reads as a mode of the card; it is a
     * property of the one field it decides, so the placement is measured here
     * too - the tabs inside the field block, on the label's own line, directly
     * above the single control that block draws, and named after that field. A
     * provider has one secret column and a Slack connection has two, and a
     * card-level mode has nothing to say about the second.
     *
     * The dangerous half is not the new field, it is the old one:
     * "a key is stored, leave it alone" is a null secret behind a row of dots,
     * and every way of offering a variable instead has a way of turning that
     * into "clear the key". So the credential is read back off the server after
     * every move - created, renamed, moved to a secret, moved back - and the
     * stored key is compared byte for byte with what was typed rather than
     * inferred from a boolean.
     *
     * One state is put in front of the page rather than made: a reference
     * pointing at nothing has no route through the API, and the check asserts
     * that as well, by trying both of the deletions that would produce one and
     * measuring the refusals. What it then reads is the real answer with the
     * flag the server sets on a reference it could not resolve.
     *
     * Its own catalog, variables and providers, all under a scratch name, swept
     * at both ends of the run.
     */
  },
  {
    name: 'provider-status-dirty-check',
    what: "an edit on a provider's page stays an edit, and Save stays on, when the check a save set off lands",
    needs: ['workspace'],
    /*
     * Issue #652. The page polls for the check a save sets off and replaced its
     * copy of the provider with the answer, which is what "changed" was
     * measured from - so an edit made in those seconds read as saved and Save
     * went grey. provider-credential-check met it in CI only, where the runner
     * was slow enough for the answer to land between a choice and its save;
     * here the answer is timed by the check rather than by the runner.
     */
  },
  {
    name: 'slack-reconnect-check',
    what: "a Slack connection's socket state on one line, with a Reconnect button that redraws it from the server's answer",
    needs: ['workspace'],
    /*
     * Issue #592. A socket that died without the client noticing stayed "open"
     * until a restart and the page said nothing - the connection's check is
     * about the token, which was fine. Tokens nobody issued, so whatever the
     * server under test does with Slack (FAILED, CONNECTING, or DISABLED where
     * it listens to none), the line has words for it and they are compared
     * with what the server reports. Its own two connections, swept at both
     * ends.
     */
  },
  {
    name: 'connection-credential-check',
    what: "each of a connection's credentials choosing its own source, without either touching the other",
    needs: ['workspace'],
    /*
     * Issue #244. #232 gave the choice to a model provider, which has one
     * secret column - so a choice made once for the card and a choice made once
     * for the field were the same thing there, and it was impossible to tell
     * which had been built. A Slack connection holds two credentials, and no
     * single switch can say that the bot token is a workspace secret while the
     * app-level token is the connection's own. That sentence is what this
     * drives, in both directions, reading the result back off the server.
     *
     * The dangerous half is the field that was already there. "A token is
     * stored, leave it alone" is a null secret behind a row of dots, and every
     * arrangement that lets somebody point the *other* field at a variable has
     * a way of turning that into "clear the token" - so a save that touches
     * neither credential is asserted to leave both, and the stored one is
     * compared byte for byte with what was typed rather than inferred from a
     * boolean.
     *
     * Its own catalog, variables and connection, all under a scratch name,
     * swept at both ends of the run.
     */
  },
  {
    name: 'slack-connection-check',
    what: 'one Slack connection type, made through the dialog and finished on its page',
    needs: ['workspace'],
  },
  {
    name: 'table-heading-font-check',
    what: "every heading of every list page's table is drawn in one font and one colour, the sorted column's included",
    needs: ['workspace'],
    // Reads what is drawn on some thirty pages; it changes nothing.
  },
  {
    name: 'markdown-math-check',
    what: 'LaTeX in rendered markdown is set by KaTeX, inline and as a display block, while money and code keep their dollars',
    needs: ['workspace'],
    // Drawn through an issue description it files and deletes again.
  },
  {
    name: 'code-copy-check',
    what: "a fenced code block carries a Copy at its top right, clear of the text, that puts the block's exact text on the clipboard and says so",
    needs: ['workspace'],
    // Drawn through an issue description it files and deletes again.
  },
  {
    name: 'tool-grant-request-check',
    what: 'an agent asking for tools shows each one asked for, with its kind and what it does, over Accept and Refuse; and a new agent may ask',
    needs: ['workspace'],
    // The question is canned on its way to the chat page; the agent and the chat are made and removed.
  },
  {
    name: 'model-offered-fill-check',
    what: "picking a model a llama.cpp server offers fills its context window and zero prices, and leaves typed fields alone",
    needs: ['workspace'],
    // The provider's listing is canned, so any provider will do and nothing is added.
  },
  {
    name: 'chat-drop-attach-check',
    what: 'a file dropped on the chat is attached, and the page stays the chat',
    needs: ['workspace'],
    // The upload is answered here and attachments are said to be allowed, so nothing is stored.
  },
  {
    name: 'new-function-panel-check',
    what: '"+ New function" opens a panel beside the form that makes the function at once, refuses a taken name there, and Cancel makes nothing',
    needs: ['workspace'],
  },
  {
    name: 'notification-bell-failure-check',
    what: 'a notification list that failed to load says so instead of "Nothing yet.", and a failed count leaves no number',
    needs: [],
    // The list and the count are failed by route; nothing is read or marked read.
  },
  {
    name: 'palette-toggle-check',
    what: 'the quick-actions shortcut closes the box it opened, and opens it again',
    needs: ['workspace'],
  },
  {
    name: 'chat-unread-check',
    what: 'a chat says how many answers arrived since it was last open, as a solid bold pill, and opening it clears the count',
    needs: ['workspace'],
    // The list's counts are rewritten in the browser; the server half is ChatUnreadTest.
  },
  {
    name: 'chat-naming-check',
    what: 'the title bar says a chat is being named, and shows the name the moment it is known',
    needs: ['workspace'],
    // The stream is answered here, so no model is asked.
  },
  {
    name: 'chat-call-stack-check',
    what: 'tool calls made one after another sit together, and the turns around them keep their gap',
    needs: ['workspace'],
    // The conversation is answered here, so nothing is asked of a model.
  },
  {
    name: 'chat-sidebar-resize-check',
    what: 'the chat list is dragged wider by its edge, stays as wide after a reload, and goes back on a double-click',
    needs: ['workspace'],
  },
  {
    name: 'chat-unread-refresh-check',
    what: "an unread count shows without a reload when the window is come back to, and the open chat stays open",
    needs: ['workspace'],
  },
  {
    name: 'model-used-by-check',
    what: "a model's page lists what uses it and each row opens it; a provider's page lists its models",
    needs: ['workspace'],
  },
  {
    name: 'desktop-network-check',
    what: "Admin › Settings draws Network access only on the desktop app, checks the two passwords, and sends the choice with the password",
    needs: [],
    // The desktop half is canned, so nothing restarts.
  },
  {
    name: 'table-cell-font-check',
    what: "a table row's cells share one font size: monospace at that size or one step smaller, a chip no larger",
    needs: ['workspace'],
  },
  {
    name: 'chat-unread-background-check',
    what: 'news in the open chat stays counted while the window is in the background, and is read on coming back',
    needs: ['workspace'],
  },
  {
    name: 'chat-unread-on-finish-check',
    what: 'an answer that finishes in a chat somebody has left shows its count at once, with nobody refocusing the window',
    needs: ['workspace'],
  },
  {
    name: 'used-by-paged-check',
    what: 'a long Used by list is paged ten at a time with the size control, and a short one has no pager',
    needs: ['workspace'],
    // The dependants are canned, so the check needs no fixture of its own.
  },
  {
    name: 'agent-orknux-default-check',
    what: 'a new agent starts with "Let this agent ask orknux about orknux" ticked',
    needs: ['workspace'],
  },
  {
    name: 'agent-add-model-check',
    what: "the agent form's Model picker links to the Models page in a new tab, with Add Model open",
    needs: ['workspace'],
  },
  {
    name: 'chat-auto-start-check',
    what: 'Chat with no chats starts one by itself and opens it with the composer focused; with chats it starts nothing',
    needs: ['workspace'],
    // The list is answered empty for the first visit; the chat it makes is real and deleted at the end.
  },
  {
    name: 'header-perspectives-check',
    what: 'the perspectives in the top bar stand closer together below 1920px, and keep their gap on a wide screen',
    needs: [],
  },
  {
    name: 'research-stop-check',
    what: 'a running research draws Stop, which stops its run, and a stopped one draws none',
    needs: [],
    // The research and the stop are answered in the browser.
  },
  {
    name: 'chat-waiting-row-check',
    what: 'a chat waiting for its answer draws one message, the wait under the answer’s name, not a second row',
    needs: [],
    // The chat and the send are answered in the browser.
  },
  {
    name: 'design-prompt-box-check',
    what: 'a long prompt stays inside its box in the image and video editors, above the Model field',
    needs: ['workspace'],
  },
  {
    name: 'chat-new-accent-check',
    what: "the chat list's + New is filled with the main accent",
    needs: [],
  },
  {
    name: 'header-display-name-check',
    what: 'the top bar calls somebody by their display name, and by their username only where there is none',
    needs: [],
    // The session's answer is rewritten in the browser, so no user of its own is needed.
  },
  {
    name: 'box-sessions-paged-check',
    what: "a box's sessions a page at a time, 5, 10 or 25, and every column ordering them",
    needs: [],
    // Canned: boxSessions is answered with twelve sessions, on a scratch box under .invalid.
  },
  {
    name: 'connection-draft-test-check',
    what: "the Add Connection dialog tests what is typed before adding it, and a plugin's guide reads as one document, unscrolled",
    needs: ['workspace'],
    // Canned kinds and a captured test mutation, so nothing reaches the database.
  },
  {
    name: 'plugin-connection-kind-check',
    what: "a plugin's connection kinds: offered by label in the dialog and on the page, worn by a row in the list, and the only thing the plugin's own picker offers",
    needs: ['workspace'],
    /*
     * No plugin in any fixture declares a kind, so the kinds are canned: the
     * `pluginConnectionTypes` query is answered here, one of the check's own
     * connections is relabelled on the way back, and a plugin asking for that
     * kind is added to the plugins list. The create and update mutations are
     * captured and answered rather than sent on - what is asserted is what the
     * screens send, and a `pluginType` no loaded plugin declares must not land
     * in the database. The live half asserts the menu with whatever the server
     * really declares, which today is nothing.
     */
  },
  {
    name: 'slack-target-check',
    what: 'both places a Slack target is typed offering what the connection can see and saying what it makes of it, and neither refusing anything',
    needs: ['workspace'],
    /*
     * Issue #176's checking half. `slackTarget` answers three ways and the
     * whole risk is drawing them alike: `NOT_FOUND` is advice - a private
     * channel this bot was never invited to looks the same as a typo from where
     * the server is standing - and `UNCHECKED` is not about the typing at all.
     *
     * The assertions that earn it a place are the ones no screenshot shows. It
     * measures the colour `NOT_FOUND` is painted against an element painted
     * `--color-danger` on the same page, and it presses Save over one and reads
     * the saved action back: the server keeps a test pinning that the field is
     * free text, and an interface that greyed the button out would contradict
     * it silently. It holds an answer back and edits the field underneath it,
     * because a reply about text that has since changed is the same lie as a
     * reading a keystroke behind. And it measures the top of the Create Action
     * button across the shortest and longest answers there are.
     *
     * One leg runs against the real server with nothing intercepted - a Slack
     * connection with no bot token is answered in one sentence without anything
     * having to reach slack.com - and that is what keeps the query, its
     * variables and the schema honest. The three outcomes themselves are forced
     * in the browser, because being found needs a Slack workspace to be found
     * in. Its connections and its action are its own, and swept at the end.
     *
     * Every one of those claims is then made a second time against the workflow
     * editor's node panel, which is where the report came from: the form
     * defines a send, a node binds the target of one step of it, and the panel
     * said nothing at all. The box is one component now, so the second surface
     * is what keeps it one - a shared piece of code nothing reads twice proves
     * nothing. Two claims are only about the panel. A parameter on the
     * Reference tab is read out of the run, so there is nothing to check before
     * the run and no box is drawn; and `target` is only a Slack channel when
     * the action behind the node sends through a Slack connection, which it
     * proves against a send through a mail server that has the same parameter
     * under the same name. It makes its own workflow and takes it away again.
     *
     * The suggesting half is the rest of #176 and is checked in the same file,
     * because it is the same field: `slackSuggestions` offers what the
     * connection can see against what has been typed so far, on both surfaces,
     * by the same component. The claims that earn their place are the ones a
     * picker gets wrong. A truncated list is asked for and the server's line
     * about being truncated is read off the screen, verbatim and at the head of
     * the list, where it cannot be scrolled past - a list that quietly leaves
     * things out teaches somebody it is the whole of what exists. An
     * `UNCHECKED` draws the reason and no rows, an empty list being the one
     * thing an unchecked answer does not know. It types something in no list,
     * keeps it and saves it. It takes a row by keyboard and by pointer, and
     * proves the check goes quiet afterwards by counting the questions that
     * reach the wire, because two answers saying the same thing under one field
     * is what the first round of this was rejected for. And it measures the
     * Create Action button and the next parameter under the longest list there
     * is: a list that pushed the form down would move the button somebody is
     * reaching for.
     */
  },
  {
    name: 'integrations-table-check',
    what: "The Integrations tables line up: a heading over every column, names left-aligned in a name's weight, and a connection's description in its own column",
    needs: ['workspace'],
    /* The servers and connections are stubbed. */
  },
  {
    name: 'connection-description-check',
    what: "A connection's description shows under its name in the list and whole on hover, is found by the list's search, and is changed on its page",
    needs: ['workspace'],
    /* Makes one connection over the API and disconnects it. */
  },
  {
    name: 'connection-url-check',
    what: "A workspace's own connection can be pointed elsewhere on its page - an HTTP one's URL and a mail one's server - and Slack's address is not offered",
    needs: ['workspace'],
    /* Makes three connections over the API and disconnects them. */
  },
  {
    name: 'connection-share-check',
    what: 'the connection page offers no Share card and no "Export as default"',
    needs: ['workspace'],
    /*
     * A negative, so it is worth saying what stops it passing for free. It
     * signs in as an administrator and asserts that it did - the card was
     * behind `session.admin`, so an ordinary member would find it missing
     * either way - waits for the form to draw, and checks the Danger Zone
     * below it is still there. It makes its own connection and removes it.
     */
  },
  {
    name: 'import-choices-check',
    what: 'a tool an agent points at can be left out of an import, and a carried component given a name',
    needs: ['workspace', 'fixture'],
    /*
     * Issue #383. An agent copied between workspaces was refused over tools a
     * plugin brought; what the importer makes of those is ImportChoicesTest's.
     * This is the dialog's two new controls: Leave out on a "Not here" tool
     * row, so the agent arrives without it, and Rename on a carried row, with
     * the agent's grant following the name chosen.
     *
     * Makes a tool and an agent in the fixture's workspace, imports them into
     * the empty one, and removes all of it.
     */
  },
  {
    name: 'import-leave-out-mcp-check',
    what: 'an MCP server an agent points at can be left out of an import from its binding question',
    needs: ['workspace', 'fixture'],
    /*
     * Issue #580. An agent pointing at a server the workspace has nowhere could
     * not be imported at all: the question offered only servers that were here.
     * Its select now offers leaving it out; the plan row says Left out and the
     * agent arrives holding only the server that was matched by name.
     *
     * Makes two servers and an agent in the fixture's workspace and one server
     * in the empty one, imports the agent across, and removes all of it.
     */
  },
  {
    name: 'import-leave-out-check',
    what: 'Leave out is offered on what a file carries, and takes dependants with it',
    needs: ['workflow', 'fixture'],
    /*
     * In. It pressed `Leave out Send Slack Message`, which names a component of
     * one developer's workflow #118, and imported into workspace 24 on the
     * grounds that 24 was empty on that machine. It reads the action's name out
     * of the envelope it just downloaded, takes whichever workflow here
     * actually carries an action, and finds the empty workspace by the name
     * `fixture.mjs` gives it - so it needs that to have been run, which is what
     * 'fixture' says.
     *
     * Its last assertion moved with the same fix: "the left-out action was not
     * created" was written as `actionsAfter === actionsBefore`, which is only
     * true of a workflow carrying exactly one action. It names the one that was
     * left out and looks for that.
     */
  },
  {
    name: 'import-refresh-check',
    what: 'the workflow list agrees with its own footer after an import and after a switch',
    needs: ['fixture'],
    // Needs a second, bigger workspace to switch away from: ORKNUX_BIGGER_WORKSPACE
    // and ORKNUX_BARE_WORKSPACE.
  },

  // --- tasks -----------------------------------------------------------------
  {
    name: 'task-check',
    what: 'a task started from the page, its event log filling up, and it reaching an end that says why',
    needs: ['workspace'],
    /*
     * Issue #229. 'workspace' rather than 'model', and for the reason the
     * session check gives: it does not need a model that *answers*. The prompt
     * is written into the task's log before the model is asked and a model that
     * never answers is recorded as a note saying so, so the log holds lines
     * either way and the task still reaches a legible ending. Everything about
     * stopping for permission needs a real judgement and is next door.
     *
     * It makes its own model, pointed at `.invalid`, and removes it - a seeded
     * installation has none, and one that borrows whatever is there says a
     * different thing on every machine.
     */
  },
  {
    name: 'task-scratchpad-check',
    what: 'the task page lists the scratchpads its session holds, opens one read-only, and follows the task as it writes more',
    needs: ['workspace'],
    /*
     * Issue #575. Task 85 wrote poem.html into a scratchpad before turning it
     * into a PDF, and its page showed none of it. A real task on a model at
     * `.invalid`, which fails at once and leaves its session behind; the pads
     * are written into that session with createSessionScratchpad. Asking the
     * finished task to carry on sets it working again, and a pad written before
     * that has to appear with the new lines, not on a reload - and the pad
     * already open has to stay open, which it did not while the stream's frames
     * carried the session id as a number and GraphQL as text.
     */
  },
  {
    name: 'task-refresh-check',
    what: 'the task page offers an interval to refresh at, and choosing one does not reopen its stream',
    needs: ['workspace'],
    /*
     * The page is a session view - steps arrive on a stream as they are
     * recorded - so a timer here is the fallback for that stream stopping
     * without saying so, which from the reader's side is indistinguishable from
     * a model thinking for four minutes.
     *
     * Two of the three assertions are ordinary: Off is the default, and a
     * chosen interval really does ask again, counted at the wire. The third is
     * why this file exists. The obvious wiring points the timer at the page's
     * own loader, which raises the loading flag, and the effect that follows
     * the task is keyed on that flag - so every tick tears the connection down
     * and opens another. Nothing on screen shows it; the requests to
     * /api/tasks/{id}/stream do, and they are what is counted.
     *
     * The task and the stream are both answered in the browser: a task that is
     * genuinely running needs a model, and a stream that stayed open would pass
     * the third assertion by accident.
     */
  },
  {
    name: 'task-picture-check',
    what: 'a picture a task drew, drawn in its outcome card rather than named in it',
    needs: ['workspace'],
    /*
     * Issue #283, the interface half. The server half is `TaskPictureTest`,
     * seven tests on both engines over a stub on the loopback address: which
     * task is offered the drawing tool, where the bytes go, what the outcome
     * comes back as, and what happens when the provider will not draw.
     *
     * What that cannot say is whether anybody sees a picture. An outcome is
     * text and always has been, so the whole difference between working and
     * broken is whether the markdown is rendered, whether the bytes behind it
     * load - `naturalWidth`, not the presence of an `<img>`, because a broken
     * picture is an `<img>` too - and whether a picture a thousand pixels wide
     * stays inside a card that is not.
     *
     * The task is fabricated in the browser, which is the opposite of what
     * `image-model-check` had to do next door and is why this one runs in CI.
     * There the drawing happens on the server from a mutation a button makes,
     * so a stub in the page would have been a check of the stub; here the
     * drawing happens inside a turn of an agent that has to decide to draw and
     * call a tool, which needs a model that answers and is `task-live-check`'s
     * territory. Every step of getting the picture into the outcome is already
     * pinned on the server. What is left is one screen given one answer, so the
     * answer is supplied.
     */
  },
  {
    name: 'task-live-check',
    what: 'a task watched while it runs and thinks, lines arriving on a page nobody reloaded, and the same account afterwards',
    needs: ['workspace'],
    ci: false,
    /*
     * The live half of #229's page, and the thinking half that came after it.
     * `task-check` next door proves the machinery around a task; this one
     * proves the *while*, which is the thing a check that only reads a finished
     * log cannot say anything about.
     *
     * Four assertions carry it, and they are written to fail rather than to
     * quietly stop meaning anything. There is no refresh control on the page,
     * so growth cannot be a poll. A marker on `window` survives, so growth
     * cannot be a reload. The line count and what the page says it is doing are
     * read in one evaluate, so "a line was there while it said Working" is one
     * moment rather than two readings a tenth of a second apart. And the count
     * of how long the model has been thinking is read, waited on and read
     * again - the shape `chat-working-check` was rebuilt around, because "the
     * thinking is drawn" would pass just as well on a build that painted all of
     * it in one go at the end.
     *
     * **It used to say 'workspace' and mean it, and that was the bug.** The
     * fixture was a model pointed at `.invalid`, on the reasoning `task-check`
     * gives: the prompt is written into the log before the model is asked, so
     * the session gets lines either way. True, and not enough. Measured, such a
     * task is forty milliseconds end to end and writes three lines, so there is
     * no "while" to catch - the page usually draws after it is already over,
     * and where it does not, everything left arrives inside one frame. What
     * used to be here was a retry loop that started up to four tasks hoping to
     * catch one running; the first time this check was ever executed it lost
     * that lottery four times out of four.
     *
     * So the fixture is a model that takes its time, which is also the only
     * kind that has any thinking to draw. `scripts/suite/reasoning-stub.py`
     * emits `reasoning_content` over twelve seconds and then calls `task_done`.
     * It cannot be stubbed in the browser, for the reason `image-model-check`
     * gives about its own: the thinking is produced by the server calling a
     * provider, written into the task's session and followed over a stream, so
     * a stub in the page would be a check of the stub.
     *
     * That is what `ci: false` costs and buys. CI keeps `task-check`, which
     * proves a task's machinery and needs nothing; what it gives up is a check
     * that could only ever have passed by luck. Run this by hand:
     *
     *   python scripts/suite/reasoning-stub.py 8198
     *   node scripts/suite/run.mjs --only task-live-check
     *
     * Where the stub is, as the server reaches it, goes in
     * ORKNUX_REASONING_STUB.
     */
  },
  {
    name: 'task-unread-check',
    what: 'a message a task never read is still on its page after the task ended, and the box is not',
    needs: ['workspace'],
    /*
     * The half of #280 that made the other half look like a bug rather than a
     * limit. The whole "Say something" card - the box and the list of what had
     * been said and not yet read - was drawn only while the task was running,
     * so a correction typed seconds before the task ended disappeared with the
     * card and left no sign anywhere that it had been typed. The row was still
     * in the database, unread, and the only way to learn that was to ask the
     * API.
     *
     * Two rules, and they are not the same rule: the box goes, because a task
     * that has ended will read nothing and the server refuses a message to one;
     * what was said stays, marked as never read, because it is the only record
     * that it happened. A task that finished normally cannot have one - the
     * loop reads what is waiting before it lets task_done through - so the
     * shape checked here is the one that survives: stopped, or failed, with
     * something unread.
     *
     * The task is answered in the browser. Producing this for real means a task
     * that ends at the exact moment somebody types, which is not something a
     * check can arrange.
     */
  },
  {
    name: 'task-message-check',
    what: 'a message typed at a task while it works, read on the next turn, and the work finishing in the shape it asked for',
    needs: ['workspace'],
    ci: false,
    /*
     * Issue #280. The third thing a person can do to a task, after answering
     * what it asked and stopping it: change what is wanted while the work is
     * going on, without stopping it and starting a new one with a better
     * prompt.
     *
     * `ci: false` for exactly the reason `task-live-check` next door is, and
     * measured the same way: a model pointed at `.invalid` fails a task in
     * forty milliseconds, so a check written against one would be typing into a
     * page that had finished before it loaded. There would be no *while*, which
     * is the whole of what this check is about.
     * `scripts/suite/message-stub.py` is a model that spends twenty-four
     * seconds on its first round and calls `task_done` on the round the message
     * reaches it. It cannot be stubbed in the browser: what is being checked is
     * that words typed into a page reach a model the *server* is talking to,
     * and a stub in the page would be a check of the stub.
     *
     * Six assertions, and the last two are the ones that would catch a build
     * that had recorded the message beautifully and never shown it to anybody.
     * The message has to reach the *model* - the stub only ever finishes on a
     * round that carries it, and says so in its summary - and the box has to be
     * absent once the task is over, because a box that takes words nothing will
     * ever read is worse than no box. In between, the page has to stop drawing
     * the message as unread without reloading, which is what says the live view
     * learnt about messages rather than only about statuses.
     *
     * Run it by hand:
     *
     *   python scripts/suite/message-stub.py 8199
     *   node scripts/suite/run.mjs --only task-message-check
     *
     * Where the stub is, as the server reaches it, goes in ORKNUX_MESSAGE_STUB.
     */
  },
  {
    name: 'issue-start-by-ai-check',
    what: 'Start by AI on an agent-assigned issue, and the link from it to the task',
    needs: ['workspace'],
    /*
     * Issue #230. 'workspace' and not 'model', for the reason `task-check`
     * gives: the prompt is written into the task's log before the model is
     * asked, so everything this asserts - the control appearing only where an
     * agent has the issue, the issue moving to In progress, the link standing
     * where the button was, and the prompt on the other end of it being the
     * issue - is true whether or not anything ever answers.
     *
     * It builds its own provider, model, agent and two issues and takes all of
     * them away again. The seeded fixture has no model at all, and one that
     * borrowed whichever agent happened to be there would say a different thing
     * on every installation.
     *
     * The second issue - the one assigned to nobody - is half the check rather
     * than a flourish. "Start by AI appears when an agent is assigned" is a
     * statement about where it does *not* appear as much as where it does, and a
     * check that only ever looked at the agent-assigned one would pass a control
     * drawn on every issue in the tracker.
     */
  },
  {
    name: 'task-permission-check',
    what: 'a task stopping for permission, saying so, ringing the bell, and carrying on once it is granted',
    needs: ['model'],
    ci: false,
    /*
     * The other half of #229, and it cannot be run unattended: what it asks a
     * model to prove is a *judgement* - given a job it has no means to do, stop
     * and ask rather than invent an answer - and only a model that answers makes
     * one. CI has none.
     *
     * Naming the gap rather than hiding it. Run it by hand against a server
     * whose model answers:
     *
     *   node scripts/suite/run.mjs --only task-permission-check
     *
     * The assertion that matters most is the last one: the grant lands on the
     * task and the agent's own `orknuxAccess` is still false. Approving something
     * for one afternoon's work must not arm the agent in every chat for ever,
     * and that is the one thing about this feature that would be a security
     * defect rather than a bug.
     */
  },
  {
    name: 'compaction-link-check',
    what: "a summarised turn's session line links to the workspace's compaction settings, which open on that section",
    needs: ['workspace'],
  },
  {
    name: 'chat-picker-keys-check',
    what: "the chat's agent picker walked with the arrow keys, skipping an inactive agent, and Enter choosing",
    needs: ['workspace'],
    /* Makes three scratch agents of its own on the workspace's chat model, so the order is known. */
  },
  {
    name: 'chat-working-check',
    what: 'a chat drawing what the model thought and what it looked up, and keeping neither inside the answer',
    needs: ['model'],
    ci: false,
    /*
     * Issues #271 and #272, and it needs a model for the same reason the three
     * above do: there is nothing to watch without one. Not a *good* model,
     * though - what it needs is one that emits reasoning and asks for a tool,
     * which is a property of the provider rather than of the answer. So the
     * assertions about text are deliberately weak, and the one that matters is
     * not about text at all: that the thinking is drawn *outside* the answer.
     *
     * That is the assertion worth having a check for. Everything downstream is
     * correct because the string it reads does not hold the thinking - the copy
     * control, the speech model and the next turn's prompt all read the
     * answer - so a change that quietly folded the two back together would look
     * perfectly fine in a screenshot and would be a reasoning model read aloud.
     *
     * Run it by hand against an installation whose provider answers the
     * OpenAI-compatible shape with `reasoning_content` and a tool call:
     *
     *   node scripts/suite/run.mjs --only chat-working-check
     */
  },

  {
    name: 'no-native-select-check',
    what: "no screen draws a native select, and the application's own one is driven by the keyboard alone",
    needs: ['workspace', 'workflow'],
    /*
     * The operating system draws a native select's menu outside the theme, so
     * every one became `Select`. Walks a spread of the screens that held them,
     * counts what is drawn, and opens one control to drive it by keys. Changes
     * an agent's progress level in the form and saves nothing.
     */
  },
  {
    name: 'select-option-hint-check',
    what: "a choice's name is its name, and what it means is a hint beside its row, under the pointer and under the arrows",
    needs: ['workspace'],
    // Opens Add Server on Integrations and its auth type list, and cancels.
  },
  // --- the two languages -----------------------------------------------------
  {
    name: 'catalogue-check',
    what: 'the Polish catalogue and the English it is keyed on, still agreeing',
    needs: ['nothing'],
    /*
     * The interface is translated by keying on the English sentence rather than
     * an invented name - `src/i18n/index.ts` says why, and chiefly that a
     * made-up key would have blinded `hint-prose-check` to every sentence in
     * the product at once.
     *
     * The one thing that costs is that rewording an English string orphans its
     * translation, silently: `t` falls back to what it was handed, so the
     * screen shows correct English and the Polish simply stops appearing. This
     * fails on the orphan. It reads the source and nothing else, so it runs
     * anywhere in about a second.
     */
  },
  {
    name: 'language-check',
    what: 'a language switch that reaches the server, redraws the page and moves <html lang>',
    needs: ['session'],
    // Every worker signs in as alice, and this puts alice into Polish for as
    // long as it runs. Everything else finds its controls by their English
    // names, so beside this one everything else is looking for words that are
    // not on the screen.
    alone: true,
    /*
     * The only check that ever sets alice's language, and it sets it back in a
     * `finally`. Everything else in this suite finds its controls by their
     * English accessible names, which works because English is what somebody
     * who has chosen nothing reads and the fixture chooses nothing - so a run
     * that left her reading Polish would fail every check after it.
     *
     * It asserts the mechanism rather than a snapshot of the words. Which
     * Polish sentence a screen shows is `catalogue-check`'s business and one
     * improved wording away from being wrong; what this cannot be allowed to
     * lose is that the choice survives to the next machine, that the whole
     * application redraws rather than only the button pressed, and that a page
     * nobody touched is in the right language after a reload.
     */
  },

  // --- held back ------------------------------------------------------------
  {
    name: 'tool-wand-check',
    what: 'the wand on the tool editor, and a change accepted where the tool is',
    needs: ['model'],
    ci: false,
    /*
     * Half of this asks a model a question and reads the answer, and it waits
     * two minutes for one. A server that cannot call a model cannot answer
     * that half, and in CI there is no model at all. Run it by hand against a
     * server whose model answers:
     *
     *   node scripts/suite/run.mjs --only tool-wand-check
     *
     * Two things about it were the suite's own dishonesty rather than the
     * gesture's. It printed NOT VERIFIED when no model could be reached and
     * counted nothing, so a server with no model reported this as a pass over
     * an untested half; that is recorded and failed now, saying whose fault it
     * is. And its fourteen verdicts went to a private counter, so a green run
     * announced "ALL PASS (1 checks)" - they are recorded.
     *
     * It also asserted that the model's answer names the tool. A model that
     * replies "What would you like to change about this tool?" has plainly been
     * told what it is looking at, and the check failed on a correct product for
     * a wording nobody controls. What the issue was about is in the request the
     * panel sends, so that is what is asserted; the wording is a NOTE.
     */
  },
  // --- boxes ----------------------------------------------------------------
  {
    name: 'address-scheme-check',
    what: "an address typed without a scheme reads http:// once the field is left - a box's and an MCP server's - and is stored that way; the placeholders ask for no scheme",
    needs: ['workspace'],
    /*
     * The box is under `.invalid` and the MCP server on a port nothing listens
     * on, so nothing reaches a network. Removes both, and sweeps what a killed
     * run left.
     */
  },
  {
    name: 'boxes-admin-check',
    what: 'Admin -> Boxes lists a row per box with Name, Type, Health, Active sessions, Free sessions and no label; a remote box is added, tested and deleted through the page; the local box offers nothing to edit; Admin Settings draws every box knob on what the server holds',
    needs: [],
    /*
     * Its boxes are at addresses under `.invalid`, so no test reaches a
     * network and none is ever up. Removes what it makes and puts back the
     * one setting it changes. Not `alone`: the settings it reads are not
     * ones another check writes.
     */
  },
  {
    name: 'boxes-agent-grant-check',
    what: "an agent's Boxes grant: starts empty, offers the labels boxes carry as you type, chips added and removed, saved as boxLabels; an orkbox_ tool reads Hide without a label, and Offer with one, cycling Offer and Always",
    needs: ['workspace'],
    /* Makes a scratch agent and a scratch box, only so there is a label to offer, and removes both. */
  },
  {
    name: 'agent-variable-grants-check',
    what: "an agent's Secret Catalogs and Variable Catalogs grants: listed from the workspace's variable catalogs, saved as secretCatalogs and variableCatalogs, ticked again on reload; variable_list reads Hide without one and Always with one",
    needs: ['workspace'],
    /* Makes a scratch agent and two empty variable catalogs, and removes all three. */
  },
  {
    name: 'session-boxes-check',
    what: "a session's Boxes panel below its scratchpads with green and orange dots, the Box tab right of Scratchpad, and a box session's log followed from nextSeq in place of the transcript",
    needs: ['workspace'],
    /*
     * The box sessions are stubbed, as session-family-check stubs its
     * members: one exists because a model called a box tool. The contract is
     * asked of the running server. Makes nothing and removes nothing.
     */
  },
];

/** The ones the CI job runs. */
export const inCi = (test) => test.ci !== false;
