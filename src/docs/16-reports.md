# Reports

**Admin → Reports** answers three questions about the whole installation: who
is using the models and what it costs, what people thought of the conversations
they had, and what failed. It is an administrator's page, and it covers every
workspace at once - narrow it to one with the **Workspace** picker where a report
has one.

The report you are looking at is in the address - `/admin/reports?report=errors`
- so a link to it, or a reload, opens that report rather than the first one.
The page also remembers which one you last had open.

Each report reads only what was **recorded**, and recording is switched on
separately for each of them, under **Admin → Settings → Reports**. A report whose
recording is off says so in one line at the top, with a link to the switch; what
was recorded while it was on stays readable after it is switched off.

## Tokens by person

![Tokens by person: the period's totals, a chart of tokens day by day, and the
people who prompted the models, biggest first](/screens/reports-usage.png)

Every call to a model is recorded against **the person who prompted it** - not
against the agent that made the call, and not against the workspace. A person
asking an agent a question in a chat is that person; somebody mentioning the bot
in a Slack thread is that Slack member; a run started by a schedule, a webhook or
the API has nobody behind it and is counted as **Unattributed**. Two people in
one conversation are two people, each with their own share of it.

**Usage tracking is off on a fresh installation** and records nothing at all
while it is off - not even anonymously. An administrator turns it on under
**Admin → Settings → Reports**, and the switch, with who changed it and when, is
in the organisation audit log.

At the top of the report:

- **Period** - the last 7, 30 or 90 days, or the last 12 months.
- **Workspace** - every workspace, or one.
- **Source** - Slack, Orknux (somebody signed in here), **Unattributed**, or all
  three.
- **Search people** - narrows the totals, the chart and the table to the people
  whose name or handle matches.
- **Export CSV** - the table as it is shown, every page of it, in its current
  order, saved as a file named after the period.

The tiles under them total the period: **Tokens**, with how much of the input
the provider served from its cache; **Cost**, at each call's own price, marked
where some models have no price at all; **People**, and how many sessions they
were in; and the **Unattributed** share.

The chart below shows the same period **day by day**, and every day of it is
there - a day with nothing recorded is a gap at zero, not a day left out. **Show**
switches what is counted:

- **Tokens** - each day's bar split into input that was read fresh, input that
  came from the cache, and output.
- **Cost** - what each day cost at the prices of the models that were called.
- **Sessions** - how many conversations were active that day.
- **Model calls** - how many calls were made to models that day.

Hover a day for its exact numbers.

The table lists the people, biggest first. Every column sorts - press the heading,
and press it again to turn the order round: **Person**, **Source**, **Sessions**,
**Input**, **Cached**, **Output**, **Cost** and **Last active**. A Slack member
is shown with their handle and the connection they wrote through.

![One person opened: each session they prompted, their share of it and what it
cost](/screens/reports-person.png)

**A person opens to their sessions.** Each session is listed with its workspace,
whoever else prompted in it, **Their share** of its tokens, the tokens and the
cost that share came to, and when it was last active. The session's name is a
link to its page, where the whole conversation is. Five sessions are shown at a
time; the pager under them shows more.

What a session cost is the sum of its calls, each at the price its model had
when it was made - prices are set on a model's own page, see *Prices, and what a
conversation costs* under Models and agents. A cost of a dollar or more is
shown to the cent.

## Ratings

![The ratings report: how many reviews arrived each day, the spread of scores,
and every review with what was written](/screens/reports-ratings.png)

A person can **review a conversation**: a score from 1 to 5 and, if they want,
what they thought. There are two ways to send one.

- From a chat's **+** menu, **Send a review**, which asks for the **Score** - 1
  is poor, 5 is excellent - and what went well or wrong, if anything.
- By telling the agent - "five stars, that was exactly right" - which sends the
  review with its `rate_session` tool. The review is drawn in the chat it was
  sent from, so it is plain what was sent, and the agent can take it back with
  `remove_session_rating` when the person asks it to.

The two are switched separately under **Admin → Settings → Reports** -
**Session ratings** for the reviews agents send, **Chat reviews** for the menu -
and both are **on** by default. **Reviews Per Conversation** in the same place
bounds how many reviews an agent may send from one conversation, two unless
changed, so an agent asked to "rate this again" does not fill the report with
copies of one opinion.

Like the other two reports it has a **Period**, a **Workspace** and a **Source**
to narrow it by. The tiles total the period: **Reviews**, the **Average** score out of 5,
**Unhappy** - the reviews that scored 1 or 2 - and **Scores**, how many gave each
score from 1 to 5. The chart shows the period day by day: **Reviews** - each
day's reviews coloured by score, 1 or 2, 3, 4 or 5 - or, switched to **Average**,
the day's mean score. Under them every review is listed - **When**, **Score**, what was
written, the **Person** who sent it, the **Agent** and the **Session** it was
about - searched with **Search reviews**, and sorted by pressing a heading.

## Errors

![The Errors report: what failed in the period, a chart per day, what failed
most often, and every failure newest first](/screens/reports-errors.png)

**What failed, in one place.** Three kinds of failure are recorded as they
happen:

- **Workflow runs** that ended failed;
- **Agents** that could not answer - their model refused, timed out or could not
  be reached, in a chat, a task or a step;
- the **Quick chat** whose model could not answer.

The tiles count them over the period - **Errors** in all, then **Workflow
runs** that ended failed, **Agents** that could not answer, and the **Quick
chat**'s model - and the chart shows them per day, coloured by kind. **Period**,
**Workspace** and **Source** narrow it as on the other reports. **Failed most often** lists
**What** failed, its **Source**, how many **Times** and the **Last** time, so a
model that has been unreachable since Tuesday stands out from one bad afternoon.
Below it every failure is listed newest first: **When**, **Source**, **What**,
the **Error** itself and the **Workspace**. **Search errors** narrows both, and
**both tables sort** - press a heading, and press it again to turn it round.

Runs that had already failed before the report existed were read in when the
installation was upgraded to it, so the report starts with history rather than
empty.

## What a conversation cost

The reports above are an administrator's. Everybody sees what their own
conversations cost, in three places:

- **Under each answer in a chat** - how many tokens the answer took and, where
  its model has prices, what it cost. This is **Answer Cost** in Preferences,
  **on for everybody** unless they turn it off; it used to be off until
  somebody turned it on, and on upgrade everybody was switched on.
- **In the corner of the composer** - the chat's running total, kept with the
  chat, so a reopened conversation still says what it has cost so far.
- **On a session's page** - its cost beside its tokens and, where the provider
  reports its timings, how fast the model read and wrote; see *How fast a model
  is* under Models and agents.

A conversation's **review**, where one was sent, is shown in the chat it was
sent from and listed under Ratings above.
