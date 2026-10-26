# Variables

Variables are the values a workspace needs but should not have written into a
workflow: an API key, a base URL, an account id. They are referenced from
function signatures, and passed to the function as parameters.

## Values and secrets

![Variables in their catalogs; a value shows what it holds, a secret only whether anything is stored](/screens/variables.png)

Every variable is one or the other, and they are listed separately.

- **Values** are shown. A hostname or an account id is not a secret, and
  hiding it only makes it harder to check.
- **Secrets** are hidden. Reveal one from its row when you need to see it; the
  hidden field cannot be edited until it is revealed, so nobody overwrites what
  they cannot read.

### Who may read a secret back

Revealing a secret is reading it, and **reading a secret back takes a role**.
Installation administrators and the workspace's administrators may; anybody
else needs a role with the **Reads secrets** scope, assigned to that workspace,
which an administrator gives under Admin → Roles. Without it the secret can
still be *used* - chosen as a credential, handed to a function - but not
shown. Every reveal is recorded in the workspace's
audit log, saying who asked and which secret.

When this rule arrived it narrowed who could reveal: somebody who did so before
without being an administrator needs that scope given to them.

Secrets are encrypted where they are stored. What is written down is
`orkx1:iv:ct` — a version, a nonce, and AES-256-GCM ciphertext — so a database
dump carries no keys.

That is also why a variable keeps no history of what it was. A function, a tool,
a skill and an agent all keep the version each save replaced; a variable does
not, deliberately, because keeping old versions of a secret would mean keeping
old secrets.

A variable is a string, a number or a boolean. There are no object variables:
a shape belongs in an object, where it can be validated.

## Catalogs

Variables are grouped into **catalogs**, the way skills are. A name must be
unique within its catalog, not across the workspace, so two catalogs may each
have a `base-url` and mean different things by it.

### Moving a variable to another catalog

![A variable's Move to, open on its row: the workspace's other catalogs to put it
in](/screens/variables-move.png)

The **move** button on a variable's row opens **Move to**, a list of the
workspace's other catalogs; choose one and the variable is in it. The arrow keys,
**Home** and **End** work the list, and **Enter** takes the one under focus. The
button is not drawn where there is only one catalog, since there is nowhere to
move to.

Moving changes nothing that uses the variable. A function's external parameter,
a node's reference and a credential field all hold the variable by identity
rather than by its catalog and name, so they read it in its new catalog as they
did in its old one. A name already taken in the catalog it is moving to is
refused, and the list says so. Secrets, skills and memories move between their
catalogs the same way, from their own rows.

The catalogs column can be folded away when it is not what you are working on.

## Using one

Add an **External parameters** section to a function, and name the variable
there. When the function runs, the variable's value arrives as its own
parameter — it is never spliced into the body as text.

A variable in use cannot be deleted; the error says what is still using it.

A workflow node's parameter can read a **value** directly, from the
**Workspace variables** group of its Reference picker, when the step runs. A
secret cannot: a parameter is handed on as text, and a secret in one would be
published. See *Values and references* under Workflows.

An agent can be granted variables by catalog - **Secret Catalogs** and
**Variable Catalogs** on its settings - to hand to a command it runs in a box.
It reads the values; it never sees the secrets, which reach the command as
environment variables and read `***` wherever the output is shown. See *Letting
an agent work in a box* under AI.

A plugin's parameters read variables the same way. On the workspace's **Plugins**
page, a parameter can be answered either with a value typed in or with one of
these variables, and a parameter the plugin declared as a secret can only be
answered with a variable. The reference is read when the plugin runs, not when
it is set, so rotating a token is one edit here rather than one per plugin.

## As a credential

Every secret field in the product can read one instead of keeping a copy.
Beside the field's own name — *API Key*, *Bot token*, *App-Level Token*,
*Password*, *Token / Key* — stand **Value** and **Reference**. Value is a
credential kept there, encrypted, belonging to that field alone. Reference
points the field at one of these secrets, read at the moment it is needed, so
rotating it is one edit here rather than one per place it is used.

The choice belongs to each field separately. A Slack connection's bot token can
be a reference while its app-level token stays its own, which is a thing a
single switch above the card could not say.

A reference can be **cleared** from the same place, which turns the field back
into a value of its own to type; and a field that reads a variable has an
**open** button beside the reference, landing on the variable in its catalog.

Only a secret can be one: a value is read with the listing, and a credential on
a listing is a credential on a screen. The reference is held by identity, so
renaming the variable or moving it to another catalog changes nothing; deleting
it is refused while anything reads it, and the refusal names what does.

Editing is inline: click the field, change it, and save with the check. Renaming
is the same edit. Deleting a catalog requires it to be empty first.

## The web search key

The workspace's web search key - the key the research and the agents' web search
use, on both the workspace's settings pages - is a secret field like every
other. Once stored it is masked, with a **Show** that reveals it to whoever may
read the workspace's secrets and records that in the audit log. It can read a
workspace secret instead of keeping its own copy, and a secret the key reads
cannot be deleted while it does. The engine (**Tavily** or **Brave**), the key
and the switch for composed answers are saved together by the page's **Save
Changes** and put back together by **Discard**, rather than each taking effect
on its own.
