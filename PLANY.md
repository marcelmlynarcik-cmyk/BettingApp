# Plan prace na BettingApp

Tento subor je spolocny pracovny backlog. Pri dalsich upravach budeme doplnat stav, zistenia a dalsie navrhy sem.

## Priorita 1 - aktualny balik

- [x] Zalozit planovaci subor pre dalsiu pracu.
- [x] Rozsirit notifikacie pri vyhodnoteni tipu/tiketu o tipera, sport, ligu, kurz, stav a odkaz na detail.
- [x] Opravit vypocet pravdepodobnosti pri podavani tiketov: primarne pre konkretneho tipera podla jeho vysledkov v danom kurzovom pasme, sporte a lige, potom z tychto tipov vyratat celkovu sancu tiketu.
- [x] Opravit ukladanie push nastaveni, hlavne volbu `finance_updates`, aby sa pri zmene jednej volby neprepisovali ostatne hodnoty na default.
- [x] Odobrat Nastavenia zo spodnej mobilnej navigacie a pridat ikonu nastaveni do horneho riadku s nazvom aplikacie.
- [x] Napojit financne push notifikacie na realne pohyby: vklad, vyber, stavka pri novom tikete a vyplata pri vyhernom tikete.
- [x] Pridat audit log vyhodnoteni tipov: kto zmenil tip, z akeho stavu na aky, kedy a cez aku akciu.
- [x] Pridat UI historiu zmien na detail tiketu z tabulky `prediction_audit_logs`.
- [x] Pridat do Nastaveni volbu jazyka aplikacie medzi SK a CZ a ulozit ju do profilu.

## Zistenia z aplikacie a databazy

- Pravdepodobnost tiketov sa pocitala cez historicke bucket-y, ale pri nedostatku vzorky casto spadla na `global|b:any`, teda rovnaky win-rate pre vsetky tipy. Model teraz zacina na kombinacii `tiper + sport + liga + kurzove pasmo`; ak je vzorka mala, stale ju pouzije, ale vyhladi ju kurzom namiesto okamziteho preskoku na global.
- Serverove push notifikacie pre zmenu tipu citaju detail tipu s joinom na `users`, `sports` a `leagues`; pouzivatel tak vidi, koho tip bol vyhodnoteny a v akom sporte/lige.
- Ukladanie push preferencii pouzivalo `upsert` s default hodnotami. To je rizikove pri ciastocnych update-och, lebo jedna zmena mohla resetnut ine volby. Update teraz najprv zabezpeci existenciu riadku a potom meni iba poslane boolean polia.
- Tabulka `push_notification_preferences` obsahuje stlpce pre vsetky aktualne volby vratane `finance_updates`.
- Zakladna schema pouziva `tickets`, `predictions`, `finance_transactions`, `users`, `sports`, `leagues`, plus auth profily a push tabulky.
- Pravdepodobnost ma ostat dynamicka pocas vyhodnocovania tiketu: OK tip sa berie ako splneny, NOK automaticky zrazi aktualnu sancu tiketu na 0.
- Aplikacia je urcena iba pre Marcel/Peter/Michal, preto zatial nepotrebujeme oddelovat tikety a financie podla Google pouzivatela.
- Mena aplikacie je CZK, v UI aj notifikaciach pouzivame `Kč`, nie `EUR`.
- Audit log je zapisovany do `prediction_audit_logs` pri rychlom vyhodnoteni tipu, hromadnom `Vsetko OK` aj editacii tiketu.
- Jazyk profilu je ulozeny v `profiles.locale`; zakladny preklad je napojeny na nastavenia a hlavnu navigaciu.
- Pri podani tiketu posielame iba notifikaciu `Novy tiket`; neposielame duplicitnu financnu notifikaciu `Nova stavka`. Ticket push obsahuje vklad, kurz a moznu vyhru.
- Pri vyhodnotenom vyhernom tikete push obsahuje vyplatu aj cisty zisk.

## Navrhy na dalsie opravy a vylepsenia

- Odlozene: ownership model cez `auth_user_id` netreba, pokial aplikacia ostava spolocna iba pre troch pouzivatelov.
- Odlozene/upravit zadanie: ulozene pre-match pravdepodobnosti netreba robit tak, aby blokovali dynamicky prepocet po OK/NOK; ak sa budu ukladat, maju byt iba historicky snapshot, nie hodnota pre aktualnu sancu tiketu.
- Doplnit email notifikacie pre financne udalosti, ak ich budeme chciet mimo Web Push.
- Postupne prelozit dalsie obrazovky cez `lib/i18n.ts`, hlavne financie, detail tiketu, statistiky a ranking.
- Zjednotit menu pre desktop a mobil tak, aby nastavenia boli vzdy v hlavicke/profilovej casti a nie ako bezna hlavna sekcia.
- Pridat testy pre `ticket-probability`, hlavne male vzorky, rozne kurzy a fallback bez historie.
- Pridat testy alebo aspon kontrolny skript pre API `/api/tickets/[id]/predictions`, aby vyhodnotenie tiketu vzdy vytvorilo spravne payout/profit/finance zaznamy.
- V databaze doplnit indexy na caste analyticke dotazy: `predictions(result, tip_date)`, `predictions(user_id, result)`, pripadne `tickets(created_at)`.
- Dlhodobo zjednotit texty bez diakritiky v serverovych push helperoch, ak budeme chciet plne slovenske texty aj mimo ASCII suborov.
- Pre Google prihlasenie doplnit obrazovku/proces prveho nastavenia: meno v profile, predvolene notifikacie, pripadne pozvanie do spolocnej skupiny.
