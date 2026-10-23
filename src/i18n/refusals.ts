import { currentLanguage } from '../session/language';

/**
 * What the server refuses, said in the reader's language.
 *
 * Keyed on `extensions.code`, which every `…ExceptionResolver` sends: the
 * exception's own class name with `Exception` dropped. `{name}` and its
 * siblings are `extensions.arguments`, by name rather than by position, so a
 * translation can put the value where Polish wants it.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately not in here
 *
 * A refusal whose only argument is the whole sentence. Several of them - a
 * model that cannot be used, a link that will not do, a move that was turned
 * down - carry a sentence assembled where the decision was made, and a Polish
 * frame around an English sentence reads worse than the English sentence. Those
 * fall back to `message`, which is complete and correct.
 *
 * And a code two exception classes would answer to. Seven names are declared
 * twice - once in `app` and once in a module - and two of those pairs do not
 * say the same thing, so the code is ambiguous and cannot be translated without
 * risking the wrong sentence. `catalogue-check` fails if a code in here is
 * declared more than once, so this list cannot rot into that quietly.
 *
 * Anything absent shows the English the server sent. That is the property worth
 * protecting: a refusal is never a bare code on a screen.
 */
const PL: Record<string, string> = {
  InstallationAddressInvalid:
    '{url} nie jest adresem, pod którym można dotrzeć do tej instalacji. Podaj adres zaczynający się od https:// lub http://, na przykład https://orknux.example.com.',
  // --- a name that is required, and one that is taken --------------------
  ActionNameInvalid: 'Nazwa akcji jest wymagana',
  AgentNameInvalid: 'Nazwa agenta jest wymagana',
  ChatTitleInvalid: 'Czat potrzebuje tytułu',
  ConditionNameInvalid: 'Nazwa warunku jest wymagana',
  ConnectionNameInvalid: 'Nazwa połączenia jest wymagana',
  IssueTitleInvalid: 'Zgłoszenie potrzebuje tytułu',
  McpServerNameInvalid: 'Nazwa serwera MCP jest wymagana',
  MemoryCatalogNameInvalid: 'Nazwa katalogu jest wymagana',
  MemoryTitleInvalid: 'Tytuł wspomnienia jest wymagany',
  ModelNameInvalid: 'Nazwa modelu jest wymagana',
  ModelProviderNameInvalid: 'Nazwa dostawcy jest wymagana',
  ProxyRuleNameInvalid: 'Nazwa reguły proxy jest wymagana',
  RoleNameInvalid: 'Rola potrzebuje nazwy',
  SkillCatalogNameInvalid: 'Katalog umiejętności potrzebuje nazwy',
  SkillNameInvalid: 'Nazwa umiejętności jest wymagana',
  TriggerNameInvalid: 'Nazwa wyzwalacza jest wymagana',
  UserNameInvalid: 'Użytkownik potrzebuje nazwy',
  VariableCatalogNameInvalid: 'Nazwa katalogu jest wymagana',
  WorkflowNameInvalid: 'Nazwa przepływu pracy jest wymagana',
  WorkspaceNameInvalid: 'Nazwa przestrzeni roboczej jest wymagana',

  ActionNameTaken: 'Akcja o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  AgentNameTaken: 'Agent o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  ConditionNameTaken: 'Warunek o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  FunctionNameTaken: 'Funkcja o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  ImportNameTaken: 'Ten import zawiera już coś o nazwie „{name}”',
  McpServerNameTaken: 'Serwer MCP o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  MemoryCatalogNameTaken: 'Katalog pamięci o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  ObjectNameTaken: 'Ta przestrzeń robocza ma już obiekt o nazwie {name}',
  RoleNameTaken: 'Rola o nazwie „{name}” już istnieje',
  SkillCatalogNameTaken: 'Ta przestrzeń robocza ma już katalog umiejętności o nazwie {name}',
  SkillNameTaken: 'Umiejętność o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  ToolNameTaken: 'Narzędzie o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  TriggerNameTaken: 'Wyzwalacz o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  VariableCatalogNameTaken: 'Katalog o nazwie „{name}” już istnieje w tej przestrzeni roboczej',
  VariableNameTaken: 'Katalog {catalog} zawiera już zmienną o nazwie „{name}”',
  WorkflowNameTaken: 'Przepływ pracy o nazwie „{name}” już istnieje',
  WorkspaceNameTaken: 'Przestrzeń robocza o nazwie „{name}” już istnieje',
  UserNameTaken: 'Użytkownik o nazwie „{username}” już istnieje',
  ToolParamDuplicate: 'To narzędzie przyjmuje już parametr o nazwie „{name}”',
  TriggerWebhookPathTaken: 'Inny wyzwalacz odpowiada już pod /api/webhooks/{path}',

  // --- something that is not there ---------------------------------------
  ActionNotFound: 'Nie ma akcji o identyfikatorze {id}',
  AgentNotFound: 'Nie ma agenta o identyfikatorze {id}',
  AttachmentNotFound: 'Nie ma załącznika o identyfikatorze {id}',
  ChatSessionNotFound: 'Nie ma czatu o identyfikatorze {id}',
  ComponentRevisionNotFound: 'Nie ma wersji o identyfikatorze {id}',
  ConditionNotFound: 'Nie ma warunku o identyfikatorze {id}',
  FunctionNotFound: 'Nie ma funkcji o identyfikatorze {id}',
  ImportNotFound: 'Nie ma funkcji {id} do zaimportowania',
  IssueAttachmentNotFound: 'Nie ma załącznika o identyfikatorze {id}',
  IssueCommentNotFound: 'Nie ma komentarza o identyfikatorze {id}',
  IssueLinkNotFound: 'Nie ma odnośnika o identyfikatorze {id}',
  IssueNotFound: 'Nie ma zgłoszenia o identyfikatorze {id}',
  IssueRelationNotFound: 'Nie ma powiązania o identyfikatorze {id}',
  LlmSessionNotFound: 'Nie ma sesji LLM o identyfikatorze {id}',
  MemoryCatalogNotFound: 'Nie ma katalogu pamięci o identyfikatorze {id}',
  MemoryNotFound: 'Nie ma wspomnienia o identyfikatorze {id}',
  ObjectNotFound: 'Nie ma obiektu o identyfikatorze {id}',
  RoleNotFound: 'Nie ma roli o identyfikatorze {id}',
  SkillCatalogNotFound: 'Nie ma katalogu umiejętności o identyfikatorze {id}',
  SkillNotFound: 'Nie ma umiejętności o identyfikatorze {id}',
  TokenNotFound: 'Nie ma tokena o identyfikatorze {id}',
  TokenNotIssuable:
    '„{username}” loguje się przez dostawcę tożsamości, więc nie można tu utworzyć dla niego tokena dostępu',
  ToolNotFound: 'Nie ma narzędzia o identyfikatorze {id}',
  TriggerNotFound: 'Nie ma wyzwalacza o identyfikatorze {id}',
  UserNotFound: 'Nie ma użytkownika o identyfikatorze {id}',
  VariableCatalogNotFound: 'Nie ma katalogu o identyfikatorze {id}',
  VariableNotFound: 'Nie ma zmiennej o identyfikatorze {id}',
  WorkflowPublicationNotFound: 'Nie ma publikacji o identyfikatorze {id}',
  WorkspaceNotFound: 'Nie ma przestrzeni roboczej o identyfikatorze {id}',
  WorkflowNotAssigned:
    'Przepływ pracy {workflowId} nie jest przypisany do przestrzeni roboczej {workspaceId}',

  ActionNotInCatalogue: 'Akcji {id} nie ma w katalogu tej przestrzeni roboczej',
  CalledWorkflowNotInWorkspace: 'Przepływu {id} nie ma w tej przestrzeni roboczej, więc węzeł Przepływ nie może go uruchomić',
  WorkflowCallsItself: '{node} uruchamia przepływ, w którym się znajduje; przepływ nie może wywołać samego siebie',
  CallCheckSecondsOutOfRange: '{seconds} to nie jest liczba sekund między sprawdzeniami wywołanego przepływu. Wybierz od 5 do 3600.',
  ConditionNotInCatalogue: 'Warunku {id} nie ma w katalogu tej przestrzeni roboczej',
  // A decision node's model, question keys and options (issue #577).
  DecisionModelNotInWorkspace:
    'Model {id} nie jest ani modelem decyzyjnym, ani modelem czatu tej przestrzeni roboczej, więc węzeł decyzji nie może go zapytać',
  DecisionQuestionKeyInvalid:
    '„{key}” nie może być kluczem pytania. Klucz to litery, cyfry i podkreślenia, zaczyna się od litery - pod nim odczytuje się odpowiedź',
  DecisionQuestionKeyTaken: 'Dwa pytania nazywają się „{key}”; każda odpowiedź wraca pod własnym kluczem',
  DecisionOptionTooLong: 'Opcja „{option}” ma więcej niż {limit} znaków, a tyle linia nie uniesie',
  ObjectNotInCatalogue: 'Obiektu {id} nie ma w katalogu tej przestrzeni roboczej',
  TriggerNotInCatalogue: 'Wyzwalacza {id} nie ma w katalogu tej przestrzeni roboczej',

  // --- something that is still in use ------------------------------------
  ActionInUse: '{name} jest używana przez {users}, więc nie można jej usunąć',
  AgentInUse: '{name} jest używany przez {nodes}, więc nie można go usunąć',
  ModelInUse: '{name} jest używany przez {users}, więc nie można go usunąć',
  ModelProviderInUse: 'Nie można usunąć {name}, dopóki używane są jego modele: {models}',
  ConditionInUse: '{name} jest używany przez {used}',
  FunctionInUse: '{name} jest wywoływana przez {callers}',
  FunctionImported: '{name} jest importowana przez {importers}',
  MemoryCatalogInUse: '{name} jest przyznany agentom {agents}, więc nie można go usunąć',
  ObjectInUse: '{name} jest używany przez {users}, więc nie można go usunąć',
  RoleInUse:
    '{name} jest przypisana do {workspaces}. Zdejmij ją najpierw z tych przestrzeni roboczych — ' +
    'inaczej ci, którzy ją mają, tracą do nich dostęp bez niczyjej decyzji.',
  SkillCatalogInUse: '{name} jest przyznany agentom {agents}, więc nie można go usunąć',
  ToolInUse: '{name} jest przyznane agentom {agents}, więc nie można go usunąć',
  TriggerInUse: '{name} jest używany przez {users}, więc nie można go usunąć',
  VariableCatalogNotEmpty:
    '{name} zawiera jeszcze {held} zmiennych. Przenieś je albo usuń najpierw; katalog jest ' +
    'folderem, a jego opróżnienie to decyzja o jego zawartości.',
  VariableInUse:
    '„{name}” jest parametrem zewnętrznym funkcji {functions}. Zdejmij ją najpierw z tych ' +
    'funkcji; usunięcie jej tutaj zmieniłoby to, co dostają.',
  VariableHeldAsCredential:
    '„{name}” jest poświadczeniem: {readers}. Daj im najpierw własną wartość albo wskaż inny ' +
    'sekret — usunięcie jej tutaj nie zostawiłoby niczym się uwierzytelnić.',
  VariableSecrecyHeld:
    '„{name}” jest poświadczeniem: {readers}, więc musi pozostać sekretem. Wartość czyta się ' +
    'razem z listą, a klucz na liście to klucz na ekranie.',
  RoleBuiltIn:
    '„{name}” jest wbudowana i nie da się jej edytować ani usunąć. Instalacja bez roli ' +
    'administratora to instalacja, której nikt nie może administrować.',

  // --- what a form got wrong ---------------------------------------------
  EmailInvalid: '„{email}” nie wygląda na adres e-mail',
  FunctionNameInvalid: '„{name}” nie jest nazwą, pod jaką da się wywołać skrypt',
  ToolNameInvalid: '„{name}” nie jest nazwą, pod jaką da się wywołać skrypt',
  FunctionParamInvalid: '„{name}” nie jest nazwą, jaką może mieć parametr',
  ToolParamInvalid: '„{name}” nie jest nazwą, jaką może mieć parametr',
  ImportNameInvalid: '„{name}” nie jest nazwą, pod jaką da się nazwać import',
  VariableNameInvalid:
    '„{name}” nie może być nazwą zmiennej. Nazwa to litery, cyfry i podkreślenia, zaczynające ' +
    'się od litery — funkcja dostaje ją jako argument, a argument musi dać się nazwać.',
  ImportCycle: 'Ten import utworzyłby pętlę: {path}',
  WorkspaceFileVersionUnknown:
    'Ten eksport przestrzeni roboczej ma format w wersji {found}, a ta instalacja czyta do wersji {reads}. ' +
    'Zaktualizuj tę instalację albo wyeksportuj go ponownie z instalacji tej wersji.',
  ConditionCycle: '{name} zawierałby sam siebie',
  ConditionFunctionRequired: 'Warunek funkcyjny potrzebuje funkcji do wywołania',
  ConditionMembersRequired: 'Warunek złożony potrzebuje co najmniej dwóch warunków do połączenia',
  ConditionFunctionElsewhere:
    '{name} należy do innej przestrzeni roboczej; warunek może wywołać funkcje tej przestrzeni ' +
    'roboczej i funkcje wtyczki',
  ConditionFunctionNotBoolean:
    '{name} zwraca {returnType}; warunek potrzebuje funkcji zwracającej wartość logiczną',
  FunctionObjectRequired:
    '„{name}” jest zadeklarowana jako obiekt, ale nie wybrano żadnego. Wskaż jeden z obiektów ' +
    'tej przestrzeni roboczej albo użyj mapy dla struktury bez określonego kształtu.',
  ToolObjectRequired:
    '„{name}” jest zadeklarowane jako obiekt, ale nie wybrano żadnego. Wskaż jeden z obiektów ' +
    'tej przestrzeni roboczej albo użyj mapy dla struktury bez określonego kształtu.',
  FunctionCodeIncomplete:
    'Brakuje: {missing}. TypeScript funkcji i skompilowany z niego JavaScript zapisywane są ' +
    'razem, żeby to, co się wykonuje, było zawsze tym, co napisano.',
  ToolCodeIncomplete:
    'Brakuje: {missing}. TypeScript narzędzia i skompilowany z niego JavaScript zapisywane są ' +
    'razem, żeby to, co się wykonuje, było zawsze tym, co napisano.',
  ActionSettingMissing: 'Ten rodzaj akcji potrzebuje: {setting}',
  ActionHoldsPlaceholder:
    '{setting} jest używane dokładnie tak, jak zapisano, więc {{…}} zostałoby wysłane jako ' +
    'tekst. Zostaw puste i pozwól każdemu węzłowi powiedzieć, co tam trafia.',
  ActionHeaderAmbiguous:
    'Nagłówkowi „{name}” podano zarówno wartość, jak i zmienną do odczytania. Może być jedno ' +
    'albo drugie.',
  ActionHeaderEmpty:
    'Nagłówkowi „{name}” nie podano ani wartości, ani zmiennej. Jeśli o to chodziło, usuń ' +
    'zamiast tego cały wiersz.',
  ActionHeaderVariableElsewhere:
    'Ta zmienna należy do innej przestrzeni roboczej, więc nagłówek „{name}” nie może jej odczytać.',
  AttachmentTooLarge: '„{name}” jest większy niż {limitMb} MB, ile może mieć załącznik',
  AttachmentsDisabled: 'Załączniki są wyłączone w tej instalacji',
  ChatAgentMissing: 'Ta przestrzeń robocza nie ma agenta do rozmowy; najpierw dodaj jednego',
  ChatDisabled: 'Czat jest wyłączony w tej instalacji',
  ChatMessageEmpty: 'Nie ma czego wysłać',
  ChatCannotBeToldMidTurn: 'Model tego czatu odpowiada jednym wywołaniem i nie przeczyta niczego w trakcie; wyślij, gdy odpowiedź będzie gotowa.',
  ChatModelNotChosen: 'Ten czat nie ma modelu, który mógłby odpowiedzieć; wybierz najpierw jeden',
  ChatPictureModelNotChosen:
    'Ta przestrzeń robocza nie ma modelu obrazu. Wybierz jeden w ustawieniach czatu przestrzeni ' +
    'roboczej albo dodaj go w Modelach.',
  ChatPictureUnstorable:
    'Narysowany obraz jest przechowywany jako załącznik, a załączniki są wyłączone w tej instalacji.',
  ConnectionUrlInvalid: 'Adres połączenia jest wymagany',
  ConnectionNotSlack: 'Połączenie {name} nie jest połączeniem Slack i nie ma gniazda do ponownego połączenia',
  McpServerAddressInvalid: 'Adres serwera MCP jest wymagany',
  MemoryContentInvalid: 'Wspomnienie potrzebuje czegoś do zapamiętania',
  ModelIdInvalid: 'Identyfikator modelu jest wymagany',
  ModelParameterNotTaken: 'Dostawca tego typu nie przyjmuje tego ustawienia modelu; zostaw je nieustawione',
  ModelParameterValueInvalid: 'Tej wartości nie ma wśród tych, które przyjmuje to ustawienie modelu; wybierz jedną z listy albo zostaw domyślną',
  ModelProviderEndpointInvalid: 'Punkt końcowy API dostawcy jest wymagany',
  ModelAnswerLimitInvalid: 'To nie jest liczba minut na odpowiedź modelu. Wybierz od 1 do 1440 albo zostaw puste, by przyjąć wartość instalacji',
  ModelProviderToolCapInvalid: 'To nie jest liczba narzędzi, którą może nieść zapytanie. Wybierz od 8 do 1024 albo zostaw puste',
  ProviderChatApiNotTaken: 'Ten typ dostawcy mówi tylko przez chat completions; API wybiera się dla dostawców Azure OpenAI. Zostaw je nieustawione',
  ModelProviderInAnotherWorkspace: 'Model można przenieść tylko do dostawcy w jego własnej przestrzeni roboczej',
  IssueCommentEmpty: 'Komentarz musi coś zawierać',
  IssueRelationToItself: 'Zgłoszenia nie da się powiązać z samym sobą',
  IssueRelationElsewhere:
    'Zgłoszenia można wiązać tylko ze zgłoszeniami z tej samej przestrzeni roboczej',
  IssueRelationAlready: 'Te dwa są już powiązane: {said}. Zdejmij najpierw to powiązanie.',
  IssueAssigneeInvalid: '{what} nie jest czymś w tej przestrzeni roboczej, do czego da się przypisać zgłoszenie',
  IssueAssigneeKindMissing: 'Przypisanie to rodzaj i identyfikator razem; {id} przyszło bez rodzaju',
  IssueObserverInvalid: '{what} nie jest czymś w tej przestrzeni roboczej, co może obserwować zgłoszenie',
  IssueAttachmentNotYours: 'Załącznik może usunąć tylko ten, kto go dołączył',
  IssueCommentNotYours: 'Komentarz może edytować tylko ten, kto go napisał',
  IssueCommentNotYoursToRemove:
    'Komentarz może usunąć tylko ten, kto go napisał, lub administrator tej przestrzeni roboczej',
  IssueLinkNotYours: 'Odnośnik może usunąć tylko ten, kto go dodał',
  LlmSessionKeyMissing: 'Sesja potrzebuje klucza; sam prefiks jeszcze jej nie nazywa',
  LlmSessionKeyTooLong:
    'Klucz sesji ma najwyżej tyle znaków, ile pozwala limit — wliczając prefiks — a ten ma {length}',
  RetentionOutOfRange: '{days} to nie jest liczba dni, przez jaką da się przechowywać historię.',
  StepsAtOnceOutOfRange: '{count} to nie jest liczba kroków przepływu, które mogą działać naraz. Wybierz od 1 do 32.',
  // How a step a dead server was in the middle of is recovered, #601.
  StepHeartbeatOutOfRange: '{seconds} to nie jest sygnał życia kroku. Wybierz od 0 do 600 sekund; 0 go wyłącza.',
  // The first wait on a rate limit inside a stream that named none, #608.
  EmptyAnswerRetriesOutOfRange: '{retries} to nie jest liczba ponowień po pustej odpowiedzi. Wybierz od 0 do 20.',
  ModelAnswerLimitOutOfRange: '{minutes} to nie jest liczba minut na odpowiedź modelu. Wybierz od 1 do 1440.',
  WritingProgressIntervalOutOfRange: '{millis} to nie jest liczba milisekund między raportami pisania. Wybierz od 200 do 10000.',
  WidgetsPerChatOutOfRange: '{widgets} to nie jest liczba widżetów jednego czatu. Wybierz od 1 do 50.',
  // Sentence completion in the chat composer, #649.
  CompletionContextTurnsOutOfRange: '{turns} to nie jest liczba wiadomości pokazywanych przy podpowiedzi. Wybierz od 0 do 50.',
  CompletionMaxTokensOutOfRange: '{tokens} to nie jest długość podpowiedzi w tokenach. Wybierz od 1 do 500.',
  CompletionTimeoutOutOfRange: '{millis} to nie jest limit czasu podpowiedzi w milisekundach. Wybierz od 200 do 60000.',
  CompletionPauseOutOfRange: '{millis} to nie jest przerwa w pisaniu w milisekundach. Wybierz od 100 do 10000.',
  WidgetTimerLimitOutOfRange: '{seconds} to nie jest liczba sekund minutnika w czacie. Wybierz od 60 do 604800.',
  ChatWidgetNotFound: 'Ten czat nie ma widżetu {id}.',
  WorkflowAutosaveOutOfRange: '{millis} to nie jest liczba milisekund, które edytor przepływu odczekuje przed zapisem. Wybierz od 200 do 10000.',
  WorkflowGraphMoved: 'Ktoś inny zapisał ten przepływ, odkąd go odczytano. Odczytaj go ponownie i scal przed zapisem',
  ReadingShownAfterOutOfRange: '{seconds} to nie jest liczba sekund czytania promptu przed jego pokazaniem. Wybierz od 0 do 120.',
  WritingForgottenOutOfRange: '{seconds} to nie jest liczba sekund ważności raportu pisania. Wybierz od 5 do 600.',
  UnusableReplyRetriesOutOfRange: '{retries} to nie jest liczba ponowień po nieużytecznej odpowiedzi. Wybierz od 0 do 10.',
  SessionValueSizeOutOfRange: '{megabytes} MB to nie jest rozmiar, jaki może mieć wartość w sesji. Wybierz od 1 do 256.',
  SessionStoreKeysOutOfRange: '{keys} to nie jest liczba kluczy, jaką może przechowywać sesja. Wybierz od 10 do 10000.',
  ReviewsPerSessionOutOfRange: '{count} to nie jest liczba recenzji, które może wysłać rozmowa. Wybierz od 1 do 100.',
  ShareToItself: 'Przestrzeń nie może udostępnić niczego sobie samej.',
  ShareExists: '{component} jest już udostępniony przestrzeni {workspace}.',
  SharedComponentNotFound: 'Nie ma tu nic o tym identyfikatorze do udostępnienia.',
  AgentCatalogNotLent: '{grant} nie jest katalogiem udostępnionym tej przestrzeni przez inną.',
  NoteCountOutOfRange: '{count} to nie jest liczba notatek dla siebie, którą może zachować rozmowa. Wybierz od 1 do 1000.',
  NoteLengthOutOfRange: '{characters} to nie jest długość, do której można ograniczyć notatkę dla siebie. Wybierz od 100 do 10000.',
  RateLimitBackoffOutOfRange: '{seconds} to nie jest liczba sekund pierwszego oczekiwania po limicie zapytań bez podanego czasu. Wybierz od 1 do 60.',
  BulkheadValueOutOfRange: '{value} to nie jest tu dopuszczalna wartość. Wybierz od {min} do {max}.',
  ClusterLeaseOutOfRange: '{seconds} to nie jest długość dzierżawy klastra. Wybierz od 5 do 600 sekund.',
  RestartAttemptsOutOfRange: '{count} to nie jest liczba podejść kroku agenta po restarcie. Wybierz od 1 do 10.',
  // Server updates, #584. ReleaseJarRefused carries a whole English reason, so it is left to `message`.
  ServerUpdatesDisabled: 'Aktualizacje serwera są wyłączone w tej instalacji (ORKNUX_SELF_UPDATE ma wartość false).',
  ServerReleaseAlreadyStored: 'Ten plik jar jest już przechowywany jako wydanie {version}.',
  ServerReleaseTooLarge: 'Ten plik jar jest większy niż {mb} MB, które przyjmuje ta instalacja.',
  // #593: the environment chose, so the page cannot.
  ServerReleasePinned: 'Ta instalacja ma przypięte wydanie {pin} przez {variable}; usuń tę zmienną, by wybierać wydanie tutaj.',
  // From a URL and the per-source switches, #589. ServerReleaseUrlRefused carries an English reason in {why}.
  ServerReleaseSourceDisabled: 'Ta instalacja nie przyjmuje wydań serwera z tego źródła ({variable} ma wartość false).',
  ReleaseDownloadOutOfRange: '{seconds} to nie jest liczba sekund ciszy dozwolona podczas pobierania pliku jar serwera.',
  ReleaseDownloadAttemptsOutOfRange: '{count} to nie jest liczba prób pobierania pliku jar serwera.',
  ReleaseDownloadBackoffOutOfRange: '{seconds} to nie jest liczba sekund oczekiwania przed wznowieniem pobierania pliku jar serwera.',
  ReleaseDownloadBackoffMaxOutOfRange: '{seconds} to nie jest liczba sekund, do której może urosnąć oczekiwanie przed wznowieniem pobierania.',
  ServerReleaseDownloadRunning: 'Pobieranie wydania serwera ({what}) już trwa; poczekaj, aż się skończy.',
  ServerReleaseDownloadNotFound: 'Nie ma pobierania wydania serwera {id}.',
  ServerReleaseNotOffered: 'orknux.ai nie oferuje wydania serwera {version}.',
  ServerReleaseDownloadMismatch:
    'Pobrane wydanie {version} nie zgadza się z tym, co orknux.ai dla niego podaje; niczego nie zapisano.',
  ReleasesKeptOutOfRange: '{count} to nie jest liczba wydań serwera do przechowywania.',
  ReleaseBootAttemptsOutOfRange: '{count} to nie jest liczba prób uruchomienia wydania.',
  ReleaseFollowOutOfRange: '{seconds} to nie jest liczba sekund między sprawdzeniami wydania.',
  ReleaseMaxOutOfRange: '{mb} MB to nie jest rozmiar, do którego da się ograniczyć plik jar serwera.',
  ReleaseRestartDelayOutOfRange: '{seconds} to nie jest liczba sekund oczekiwania przed restartem.',
  // Log levels from Admin -> Settings, #591.
  HttpToolRulePatternMissing:
    'Reguła {position} nie ma wzorca URL. Wpisz wyrażenie regularne dla całego adresu albo usuń regułę.',
  HttpToolRulePatternTooLong: 'Wzorzec URL reguły {position} jest dłuższy niż {max} znaków.',
  HttpToolRulePatternInvalid: 'Wzorzec URL reguły {position} nie jest wyrażeniem regularnym: {reason}.',
  HttpToolRuleMethodsMissing: 'Reguła {position} nie pozwala na żadną metodę. Wybierz co najmniej jedną.',
  HttpToolRuleMethodUnknown: 'Reguła {position} wymienia {method}, a narzędzia HTTP tej metody nie wysyłają.',
  // Watchers, issue #606.
  WatcherNotFound: 'Nie ma obserwatora #{id}.',
  WatcherNotActive: 'Obserwator #{id} już się zakończył.',
  WatcherMaxSecondsOutOfRange: '{seconds} to nie jest czas, przez jaki obserwator może działać. Wybierz od 60 do 31536000.',
  WatcherMinIntervalOutOfRange: '{seconds} to nie jest interwał, którego można wymagać od obserwatora. Wybierz od 1 do 86400.',
  UnknownTimeZone: 'Nie ma strefy czasowej o nazwie „{timeZone}”; podaj nazwę IANA, np. „Europe/Warsaw”.',
  WatcherLookBackoffInvalid: 'To nie jest poprawne rzednięcie spojrzeń agenta: pierwsze opóźnienie od 60 sekund do tygodnia, mnożnik od 1 do 10, najdłuższe oczekiwanie co najmniej tyle co pierwsze opóźnienie i najwyżej rok.',
  WatcherMinAgentCheckOutOfRange: '{seconds} to nie jest odstęp, którego można wymagać od spojrzeń agenta na wynik obserwatora. Wybierz od 1 do 31536000.',
  WatcherMaxPerAgentOutOfRange: '{count} to nie jest liczba obserwatorów, na jaką można pozwolić agentowi. Wybierz od 0 do 1000.',
  LogLevelUnknown: '„{level}” nie jest poziomem logowania. Wybierz TRACE, DEBUG, INFO, WARN, ERROR, OFF lub INHERIT.',
  LoggerNameInvalid:
    '„{name}” nie jest nazwą loggera. Użyj liter, cyfr, kropek, $ i _, najwyżej {max} znaków.',
  RootLogLevelInherit:
    'Główny logger nie ma po kim dziedziczyć. Wybierz poziom albo wyczyść go, by wrócić do konfiguracji.',
  LogRootRevertOutOfRange: '{minutes} to nie jest liczba minut, przez jaką poziom główny może być poniżej INFO.',
  LogFollowOutOfRange: '{seconds} to nie jest liczba sekund między odczytami poziomów logowania.',
  RevisionNotRestorable: '„{name}” nie jest tu edytowalne, więc nie da się przywrócić jego wersji',
  TaskSweepIntervalOutOfRange:
    '{minutes} to nie jest liczba minut, przez jaką zadanie może czekać w kolejce.',
  TaskSweepNotConfigurable:
    'Ta instalacja prowadzi zadania na Temporalu, gdzie czas oczekiwania zadania w kolejce nie jest ustawiany tutaj',
  TriggerConnectionRequired: 'Wyzwalacz połączenia przychodzącego potrzebuje połączenia i zdarzenia',
  TriggerPayloadInvalid:
    'Ładunek musi być obiektem JSON, żeby jego pola dały się odczytać jako wejście',
  TriggerScheduleRequired: 'Zaplanowany wyzwalacz potrzebuje wyrażenia cron',
  TriggerScheduleInvalid: '„{cron}” nie jest wyrażeniem cron, jakie da się tu zaplanować',
  TriggerScheduleUnreachable: '„{cron}” to wyrażenie cron, którego chwila nigdy nie nadchodzi',
  TriggerWebhookAuthFunctionRequired: 'Uwierzytelnianie funkcją potrzebuje funkcji do zapytania',
  TriggerWebhookAuthFunctionNotBoolean:
    '{name} nie odpowiada prawdą ani fałszem. Webhook uwierzytelnia funkcja mówiąca tak albo nie.',
  TriggerWebhookPathRequired: 'Wyzwalacz webhooka potrzebuje ścieżki, pod którą odpowiada',
  TriggerWebhookShapeRequired:
    'Wyzwalacz webhooka potrzebuje obiektu mówiącego, co musi zawierać żądanie',
  TriggerWebhookPathInvalid:
    '„{path}” nie jest ścieżką w tej instalacji. Webhook odpowiada tutaj, więc podaj miejsce ' +
    'tutaj — „build/finished”, a nie własny adres URL.',
  TriggerActionUnsupported: 'Nic nie dostarcza jeszcze zdarzeń {action}, więc wyzwalacz nie ma czego nasłuchiwać',
  SecretCredentialAmbiguous:
    'Pole trzyma własne poświadczenie albo czyta je ze zmiennej przestrzeni roboczej, nie oba ' +
    'naraz. Wyślij wartość albo zmienną, nie jedno i drugie.',
  FunctionExternallyManaged:
    '„{name}” pochodzi z wtyczki i nie da się jej tutaj zmienić. Wczytaj wtyczkę ponownie, aby ' +
    'zmienić to, co deklaruje.',
  ImportNotEditable:
    '{name} pochodzi z wtyczki, więc nie da się jej zaimportować. Skieruj na nią akcję zamiast tego.',
  UserExternallyManaged:
    '„{username}” pochodzi od dostawcy tożsamości i nie da się go tutaj edytować. To, co mówi ' +
    'o nim dostawca, nadpisze to przy jego następnym logowaniu.',
  PasswordNotSettable:
    '„{username}” loguje się przez dostawcę tożsamości, więc nie ma tu hasła do ustawienia',
  PasswordTooShort: 'Hasło potrzebuje co najmniej {shortest} znaków',
  PasswordWrong: 'To nie jest obecne hasło',

  // --- boxes ---------------------------------------------------------------
  BoxNotFound: 'Nie ma skrzynki {id}',
  BoxNameTaken: 'Skrzynka o nazwie „{name}” już istnieje',
  BoxLabelRequired: 'Skrzynka potrzebuje etykiety - to po niej agent dostaje do niej dostęp',
  LocalBoxNotEditable: 'Lokalnej skrzynki nie zmienia się tutaj. Jej etykieta to zawsze local, a ustawienia są w ustawieniach administratora',
  BoxNameInvalid: 'Nazwa skrzynki nie może być pusta ani dłuższa niż 255 znaków',
  BoxAddressInvalid: '„{address}” nie jest adresem skrzynki. Podaj go ze schematem, np. http://sandbox.internal:8090.',
  LocalBoxNotRemovable: 'Lokalnej skrzynki nie da się usunąć; wyłącza się ją w ustawieniach administracyjnych',
  BoxUnreachable: 'Nie udało się połączyć ze skrzynką {name}',
  LocalBoxRuntimeUnknown: '„{runtime}” nie jest środowiskiem lokalnej skrzynki. Wybierz local albo docker.',
  LocalBoxMaxSessionsOutOfRange: '{count} to nie jest liczba sesji lokalnej skrzynki. Wybierz od 1 do 1000.',
  LocalBoxTtlOutOfRange: '{seconds} to nie jest czas życia sesji lokalnej. Wybierz od 60 do 604800 sekund.',
  LocalBoxIdleTimeoutOutOfRange: '{seconds} to nie jest limit bezczynności sesji lokalnej. Wybierz od 60 do 86400 sekund.',
  BoxOutputShownOutOfRange: '{bytes} to nie jest liczba bajtów wyjścia pokazywanego w karcie Skrzynka. Wybierz od 65536 do 67108864.',
  LocalBoxOutputKeptOutOfRange: '{bytes} to nie jest liczba bajtów zachowywanego wyjścia lokalnej skrzynki. Wybierz od 0 do 16777216.',
  BoxCommandWaitOutOfRange: '{seconds} to nie jest czas oczekiwania na polecenie. Wybierz od 1 do 3600 sekund.',
  BoxCommandTimeoutOutOfRange: '{seconds} to nie jest limit czasu polecenia. Wybierz od 1 do 86400 sekund.',
  BoxOutputBytesOutOfRange: '{bytes} to nie jest liczba bajtów wyjścia polecenia. Wybierz od 1024 do 4194304.',
  BoxRequestTimeoutOutOfRange: '{seconds} to nie jest limit czasu żądania do skrzynki. Wybierz od 1 do 600 sekund.',
  BoxMaxPortsOutOfRange: '{count} to nie jest liczba portów, które sesja w skrzynce może wystawić. Wybierz od 0 do 20.',
  BoxPortCheckOutOfRange: '{seconds} to nie jest liczba sekund ważności sprawdzenia portu. Wybierz od 2 do 600.',
  BoxPortCheckWaitOutOfRange: '{millis} to nie jest liczba milisekund oczekiwania przy sprawdzaniu portu. Wybierz od 100 do 10000.',
  BoxPortNotFound: 'Nie ma wystawionego portu {id}.',
  BoxPortSessionClosed: 'Portu {port} nie da się otworzyć: jego sesja w skrzynce już nie działa.',
  BoxPortUnreachable: 'Nie udało się otworzyć portu {port}: {why}',
  InteractionRequestNotFound: 'Nie ma pytania {id}.',
  InteractionOptionUnknown: '{option} nie jest jedną z odpowiedzi na to pytanie.',
  InteractionAlreadyAnswered: 'Na pytanie {id} już odpowiedziano.',
  InteractionAnswerInvalid: 'Ta odpowiedź nie pasuje do pytania.',
  BoxSessionIdleOutOfRange: '{seconds} to nie jest liczba sekund bezczynności sesji w skrzynce. Wybierz od 60 do 86400.',
  BoxEditUndoStepsOutOfRange: '{steps} to nie jest liczba zmian w skrzynce do cofnięcia. Wybierz od 0 do 100.',

  // --- who is asking ------------------------------------------------------
  SignInRequired: 'Zaloguj się, aby to zobaczyć',
  AdminRequired: 'Ta czynność wymaga roli administratora',
  WorkspaceForbidden: 'To nie istnieje albo nie masz do tego dostępu',
  SecretReadForbidden:
    'Odczytanie sekretów przestrzeni {name} wymaga roli, która odczytuje tam sekrety, albo roli, która nią ' +
    'administruje. Używanie ich - w połączeniu, funkcji czy agencie - tego nie wymaga.',
  WorkspaceAdminRequired:
    'Ta czynność wymaga roli administrującej przestrzenią {name}. Móc widzieć przestrzeń roboczą ' +
    'to nie to samo co ją prowadzić, a rola administrująca inną przestrzenią nie administruje tą.',
  WorkspaceMemberUnknown:
    '{username} nie należy do tej przestrzeni roboczej. Członkostwo wynika z ról, w Admin > Role.',
  WorkspaceMemberFixed: '{username} jest administratorem instalacji i administruje każdą przestrzenią roboczą.',
  WorkspaceAdminRoleNotAssigned:
    '{names} nie mogą administrować tą przestrzenią roboczą, nie będąc do niej przypisani. ' +
    'Dodaj je do ról, które ją otwierają, a potem oznacz jako administrujące.',
};

const CATALOGUES: Record<string, Record<string, string>> = { pl: PL };

/** The refusals for the language in force, or nothing where there are none. */
export function refusalsIn(): Record<string, string> {
  return CATALOGUES[currentLanguage()] ?? {};
}
