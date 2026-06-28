# Plan prace na BettingApp

Tento subor je spolocny pracovny backlog. Pri dalsich upravach budeme doplnat stav, zistenia a dalsie navrhy sem.

## Priorita 1 - aktualny balik

- [x] Zalozit planovaci subor pre dalsiu pracu.
- [x] Rozsirit notifikacie pri vyhodnoteni tipu/tiketu o tipera, sport, ligu, kurz, stav a odkaz na detail.
- [x] Opravit vypocet pravdepodobnosti pri podavani tiketov: primarne pre konkretneho tipera podla jeho vysledkov v danom kurzovom pasme, sporte a lige, potom z tychto tipov vyratat celkovu sancu tiketu.
- [x] Opravit ukladanie push nastaveni, hlavne volbu `finance_updates`, aby sa pri zmene jednej volby neprepisovali ostatne hodnoty na default.
- [x] Odobrat Nastavenia zo spodnej mobilnej navigacie a pridat ikonu nastaveni do horneho riadku s nazvom aplikacie.

## Zistenia z aplikacie a databazy

- Pravdepodobnost tiketov sa pocitala cez historicke bucket-y, ale pri nedostatku vzorky casto spadla na `global|b:any`, teda rovnaky win-rate pre vsetky tipy. Model teraz zacina na kombinacii `tiper + sport + liga + kurzove pasmo`; ak je vzorka mala, stale ju pouzije, ale vyhladi ju kurzom namiesto okamziteho preskoku na global.
- Serverove push notifikacie pre zmenu tipu citaju detail tipu s joinom na `users`, `sports` a `leagues`; pouzivatel tak vidi, koho tip bol vyhodnoteny a v akom sporte/lige.
- Ukladanie push preferencii pouzivalo `upsert` s default hodnotami. To je rizikove pri ciastocnych update-och, lebo jedna zmena mohla resetnut ine volby. Update teraz najprv zabezpeci existenciu riadku a potom meni iba poslane boolean polia.
- Tabulka `push_notification_preferences` obsahuje stlpce pre vsetky aktualne volby vratane `finance_updates`.
- Zakladna schema pouziva `tickets`, `predictions`, `finance_transactions`, `users`, `sports`, `leagues`, plus auth profily a push tabulky.

## Navrhy na dalsie opravy a vylepsenia

- Pridat `auth_user_id` alebo ownership model aj k tiketom/financiam, ak ma kazdy Google pouzivatel vidiet iba svoje data. Teraz aplikacia cez admin klienta pracuje globalne s rovnakymi datami.
- Doplnit databazovu migraciu pre ulozene odhady pravdepodobnosti, ak chceme zachovat povodnu pre-match sancu aj po neskorsom vyhodnoteni a zmene historie.
- Zaviest audit log pre vyhodnotenia tipov: kto zmenil tip, z akeho stavu na aky, kedy a z akeho zariadenia.
- Pridat push/email notifikacie pre financne udalosti, nie iba preferenciu. Volba `finance_updates` existuje, ale treba prejst, ci vsetky financne operacie realne odosielaju udalosti.
- Zjednotit menu pre desktop a mobil tak, aby nastavenia boli vzdy v hlavicke/profilovej casti a nie ako bezna hlavna sekcia.
- Pridat testy pre `ticket-probability`, hlavne male vzorky, rozne kurzy a fallback bez historie.
- Pridat testy alebo aspon kontrolny skript pre API `/api/tickets/[id]/predictions`, aby vyhodnotenie tiketu vzdy vytvorilo spravne payout/profit/finance zaznamy.
- V databaze doplnit indexy na caste analyticke dotazy: `predictions(result, tip_date)`, `predictions(user_id, result)`, pripadne `tickets(created_at)`.
- Skontrolovat meny v textoch: UI casto ukazuje `Kc`, ale niektore push notifikacie pouzivali `EUR`. Treba zvolit jednu menu a drzat ju vsade.
- Pre Google prihlasenie doplnit obrazovku/proces prveho nastavenia: meno v profile, predvolene notifikacie, pripadne pozvanie do spolocnej skupiny.
