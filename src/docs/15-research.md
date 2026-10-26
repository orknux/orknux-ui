# Research

A **research** is a question the workspace finds out about for you: it is
broken into searches, the sources are read and noted, and a report is written
from those notes that cites each one by number. It is not a chat answer with a
longer prompt. A research is run by one of the workspace's own workflows, step
by step, it keeps every source it read and why, and the report is saved on the
Artifacts page as a PDF or a document you can download, link to and read again
next month.

Research is under **Explore** in the top bar, at
`/workspace/<id>/explore/research`. An `/analysis/...` address from before
Explore had its name opens the same page.

![The workspace's research: finished ones with their mode, model, how long they
took and their report, and one still running](/screens/research.png)

The list holds the workspace's research, newest first: the question, the
**Mode** it ran in, the **Model** its writer thought with (a link to the model's
page), its **Status**, how many **Search rounds** it made, when it was
**Started** and how long it **Took**, its **Result** - **PDF** or **Document** -
and **Run**, which opens the workflow run doing it. While a research is running,
Result says how many sources it has read so far. A research that was
reviewed says **Reviewed** beside its question. **Remove** takes a research off
the list; its run and its file are kept.

**Auto** in the corner reads the list again every few seconds while something
is running, and **Refresh** beside it reads it now, whatever Auto is set to.

## Starting one

**New research** opens the form. Every field has a **(?)** beside its name that
says what it does, so the paragraphs below are the long version of what the
form says in a line.

![New research, filled in, with the (?) beside Use web search
open](/screens/research-new.png)

| Field | What it decides |
| --- | --- |
| **Question** | What the research sets out to answer. Ask it as you would ask a person; it is the title of the research and of its report. |
| **Mode** | How far it goes. Each mode is a workflow with its own number of searches and steps - see *Modes are workflows* below. Each says beside it roughly how long it takes: **Shallow** usually a few minutes, **Medium** usually several, **Deep** more than several. |
| **Add mode** | A mode of your own: a **Mode name**, and what it **Runs** - one of the workspace's workflows, or **A copy of** another mode's workflow to change. |
| **Use web search** | Search the web for sources. Off, it reads only the documents and the websites you name. On by default. |
| **Include images** | Look for pictures, place them in the report and keep each one on the Artifacts page. On unless you have left it off before. |
| **Review** | Have a reviewer read the draft and the writer revise it before it is saved - see *Reviewing a report before it is saved*. |
| **Follow-up questions** | How many questions it suggests once it is finished, 0 to 10, each a research of its own to start with a click. Empty is the workspace's number. |
| **Websites** | **Include** keeps the search to these sites; **Exclude** never uses them. Each takes a domain (`example.org`) or an address, added with **Add**. With web search off, the sites under Include are read directly. |
| **Documents** | Documents on the workspace's Artifacts page to read as sources, found with **Find a document**, or **Upload**ed from here, which puts them on the Artifacts page first. Include and Exclude, as for websites. Text, Markdown, HTML, JSON and PDF can be read. |
| **Language** | The register the report is written in: **Academic**, **Colloquial** or **Formal**. |
| **Output** | What the finished report is saved as: **PDF**, or a **Document** the Artifacts page shows as text. |

The form remembers, per workspace and in your browser, the **Include images**
and **Review** boxes and how many follow-up questions you asked for, so the next
research starts as the last one did.

**A research that searches the web needs a search key.** Web search uses the
workspace's own search settings, and a workspace with no key it can read has no
search to offer: the form says *This workspace has no search key; set one in
Search settings or turn off web search.* and **Start** stays off until one of
the two is done. A research started some other way - by an agent, through the
API - is refused before it starts, for the same reason. Before this check a
research planned its searches and then failed when the first one was refused.

A research with web search off still needs something to read: a document, or a
website under Include. With neither it is refused.

### Which agents do the work

A research is done by agents - ordinary agents from the workspace's Agents page,
each thinking with the model on its own page. There are three parts to the
work: **Planner**, which turns the question into searches; **Writer**, which
reads what was found and writes the report, and whose model also takes the
notes on each source; and **Reviewer**, which reads the draft, where the
research is reviewed. A research that searches the web lends those agents web
search for the length of that research, whether or not they hold it otherwise.

The form offers two ways to choose them:

- **Single agent**, the default: one **Agent** picker, and that agent plans,
  writes and reviews. There is nothing more to pick and nothing per step to
  override.
- **An agent per step**: a **Planner**, a **Writer** and a **Reviewer** picker,
  each empty until you choose. **Start** stays off until every agent the
  research needs is chosen - the Reviewer only where **Review** is ticked.

Orknux does not create agents for research in a workspace: the agents are yours,
and an agent with no chat model is refused with a sentence saying so. An agent
made for something else can still do a part. It is told its own instructions
first and then what the part needs - the review, for one, is a verdict in a
fixed shape that the Review step reads, and an agent that had never heard of it
would answer in prose.

## Watching it run

A research opens on its own page as soon as it is started, and the list links
to it. The page is the question as its title, with **Back** to the list, and a
summary underneath: **Status**, with a spinner while it runs; **Mode**;
**Model**; **Planner**, **Writer** and, where reviewed, **Reviewer**, each a
link to the agent; **Language**; **Output**; **Started**; and **Took** once it
is over.

![A research gathering its sources: the step it is in, the document being read
now as a row at the end, and Stop beside Open the run](/screens/research-running.png)

**Progress** draws the steps of its mode's workflow in order - **Plan research**,
**Gather sources**, **Deepen findings**, **Write report**, **Review report** and
**Save report** - with the ones taken ticked and the one it is in marked. Review
report is drawn skipped for a research that was not reviewed. Under the steps
it says what it is doing now - *Gathering sources* and the page or document in
hand - and three numbers: **Searches**, **Sources read** and **Search rounds**
(1 is the plan's own searches, and each round of deepening is one more).

**Sessions**, a line under the steps, opens what each agent was asked, the
tools it called and what it answered: one link per step that has an agent -
Plan research, Write report and Review report. A session is the same page a
chat's or a workflow step's is, with its transcript, its thinking and what it
cost.

The page fills in as the research goes:

- **Sub-questions** - the searches the question was broken into.
- **Sources** - every source read so far, numbered as the report will cite
  them, with where it came from (a website's host, or **Artifacts** for a
  document) and whether it is **Web** or a **Document**. Hover a source for the
  notes taken on it. The page or document being read *now* is a row at the end,
  marked **Reading…** and not yet numbered: one the model finds nothing in on
  the question never becomes a source.
- **Report** - drawn as the writer writes it, marked **Writing…**, until the
  finished one takes its place.
- **What it was given** - the websites and documents it was told to use or
  avoid, and whether web search was off or images on.

**Time left** appears beside Started once the workspace has three finished
research in the same mode: it is measured step by step from how long those
took, and says nothing before there is enough to measure.

**Stop** ends the research before its next step, as stopping its run does.
**Open the run** opens the workflow run underneath, where every step's log says
what it did: each search and how many results it gave, each page read or passed
over and by which rule, the documents read, and the file saved. **Auto** and
**Refresh** work as they do on the list.

## The report

![A finished research's sources, numbered, and the report that cites them by
those numbers](/screens/research-report.png)

A finished research shows its **Report** - the PDF drawn page by page, or the
document as text - with **Download** and **Open in Artifacts**. The report opens
with a title and a short summary, gives its findings under headings and ends
with a conclusion; every claim cites the source it came from as `[n]`, and the
numbered sources are listed after it. Where the sources disagree or are thin,
it says so.

The report is saved on the workspace's **Artifacts** page as soon as it is
written, so it is there for anybody in the workspace, and an agent can be
pointed at it like any other file.

**Images.** With **Include images** on, Gather also looks for pictures: what
the picture search answers for the question, then the pictures on the pages
read, and the pictures inside the documents read - without web search, only
the last two. Each is kept only where its bytes are a PNG, JPEG or GIF, and
within the installation's limits on how many, how large and how small; every
picture passed over is named in the step's log with the rule it failed. The
writer is told the kept ones by number and places the ones it wants; the PDF
lays them out with their caption and source, and a document links them. The
page shows them under the report as a gallery, each with its caption and where
it came from, and opens them over the page.

## Reviewing a report before it is saved

With **Review** ticked, the report is read before it is saved. The **Reviewer**
is shown the question, the plan, every source with the notes taken on it, and
the draft, and answers with a verdict: **Accepted**, or **Changes asked for**
with each issue it found - an unsupported claim, a missing part of the plan, a
wrong citation, a claim that contradicts a source, or formatting - quoting the
passage and saying what to change. The writer then writes the whole report
again with those changes, and the reviewer reads it again, for as many rounds
as **Review rounds** allows: one unless **Workspace Settings → Research** says
otherwise. A round that accepts ends the review.

![The end of the same research: the follow-up questions it suggests, the one
already started from it, and the review round that asked for a
change](/screens/research-follow-ups.png)

The **Review** panel under the report lists the rounds: the verdict, how many
issues, whether the writer revised for them and how long the report was before
and after, the reviewer's summary, and each issue with its fix. The list marks
a reviewed research **Reviewed**.

A mode whose workflow has no Review step - one somebody drew themselves - cannot
be reviewed: the box is off and its (?) says why.

## Follow-up questions

A finished research suggests what to research next: under the report,
**Follow-up questions** lists the questions a reader of it would most want
answered next, each specific and none repeating a part already covered. They
are asked for in one short call once the report is final, so they are never in
the report or its file.

Pressing one asks first, then starts a research on it with everything this one
was started with - mode, agents, language, output, sources, images and review.
The new one says **Follow-up of #n** in its summary, a link back, and this one
lists it under **Follow-up research** with its status.

How many are suggested is the form's **Follow-up questions**, then the
workspace's own number under **Workspace Settings → Research**, then the
installation's (five; `ORKNUX_TUNING_RESEARCH_FOLLOWUPS`). 0 suggests none.

## When it fails, and restarting

A research fails with the reason in a box at the top of its page, and the step
it stopped at marked in Progress. Some failures are handled before you see them:

- **A step that could come out differently is tried again.** A model that
  answers with nothing, for one, is asked twice more, ten seconds apart
  (`ORKNUX_TUNING_RESEARCH_STEP_RETRIES` and
  `ORKNUX_TUNING_RESEARCH_STEP_RETRY_SECONDS`, also under Admin → Settings →
  Limits), and the page says the step is being tried again. A research that
  read nothing still fails at once.
- **A step cut short by a server restart is run again** when the server is
  back. Plan, Gather, Deepen and Write change nothing outside the research, so
  running them again is safe - twice at most
  (`ORKNUX_TUNING_RESEARCH_RESUME_AFTER_RESTART`, 0 to fail it instead). Save is
  not, and is restarted from the page.
- **A research that read nothing writes no report.** When every search is
  refused - no key, a spent quota - Gather fails saying what the search
  answered, rather than the writer writing up what its model already believed.

**Restart**, in the header of a failed or stopped research, runs it again as the
same research from the step it failed or was cut short at. The steps before it
are carried over from its run: the plan is not asked for again, and the
sources already read are kept. Every step already taken also offers **Restart
from here** when you point at it, to go back further - to write the report
again from the same sources, say. A research still running is refused, as is a
step its run never reached.

Re-running a research's run from the Runs page - **Rerun**, or **Rerun from** a
step - carries the research onto the new run too, so its page follows that run
to the end.

## Modes are workflows

A mode is one of the workspace's workflows. The three every workspace has -
**Shallow**, **Medium** and **Deep** - are built in: hidden from the Workflows
list unless **Show built-in** is ticked, and marked Built-in there. Each is drawn
as its steps:

![The Shallow mode's workflow in the editor: Plan research, Gather sources,
Deepen findings, Write report, Review asked for?, Review report and Save
report](/screens/research-mode.png)

| Step | What it is | Its knobs |
| --- | --- | --- |
| **Plan research** | An agent node: the Planner breaks the question into searches | how many sub-questions, in its prompt |
| **Gather sources** | An action: searches each, reads what it finds and notes it | results per search, how many sources, pages per source |
| **Deepen findings** | An action: asks what would fill the gaps, and searches again | breadth and depth |
| **Write report** | An agent node: the Writer writes from the notes | - |
| **Review asked for?** and **Review report** | Whether to review, and the review rounds | rounds, in Workspace Settings |
| **Save report** | An action: lays the report out and saves it to Artifacts | - |

| Mode | Sub-questions | Results per search | Sources | Pages per source | Breadth | Depth |
| --- | --- | --- | --- | --- | --- | --- |
| Shallow | 3 | 3 | 8 | 1 | 0 | 1 |
| Medium | 5 | 4 | 20 | 2 | 2 | 2 |
| Deep | 6 | 5 | 50 | 3 | 4 | 3 |

So changing what a mode does is editing the step it is about: more
sub-questions is Plan's prompt, more sources is Gather's parameter. Each step
carries the retry policy described above. A mode that has been edited is left
as it is when Orknux upgrades the built-in modes; one still drawn as it was
seeded is upgraded in place.

**Add mode**, on the New research form, makes one of your own, running a
workflow you drew or a copy of one of these to change. The steps are ordinary
actions and agent nodes, so a workflow drawn around them can also be started by
a trigger or a schedule.

The installation bounds what any research reads - how many sources, how many
characters of a page and of a document
(`ORKNUX_TUNING_RESEARCH_SOURCES_MOST`, `ORKNUX_TUNING_RESEARCH_PAGE_CHARACTERS`,
`ORKNUX_TUNING_RESEARCH_DOCUMENT_CHARACTERS`) - whatever a mode asks for.

## Asking an agent to research

An agent with Orknux access can start a research for you: `orknux_start_research`
takes the question and the rest of the form - mode, agents, language, output,
sources, images, review, follow-up questions, or a research to follow up -
and `orknux_research` reads one back, its progress, report and follow-up
questions included. An agent starts a **Shallow** research unless you asked for
a deeper one; told the modes as a list to pick from, agents used to pick Deep
for any question that sounded big. `orknux_restart_research` restarts one, as
Restart does.
