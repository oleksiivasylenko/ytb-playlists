# Аудит промптів сумаризації — 7 жовтня 2026

Проаналізовано 100 найсвіжіших збережених HTML-підсумків для різних відео з активного сервера, до якого підключене розширення. На момент вибірки сервер повернув 237 унікальних відео з підсумками. Дати генерації вибірки: 6 червня — 7 жовтня 2026. Моделі: 53 результати `openai/gpt-6-luna-pro`, 47 результатів `google/gemini-3-flash-preview`.

Для всіх 100 результатів перевірено повний HTML, структуру, закінчення та діапазон таймкодів; прочитано огляди змісту з початком, основними тезами, тематичними заголовками й закінченням. Окремі показові результати розглянуто детальніше й зіставлено з відповідними фрагментами збережених транскриптів. Це редакторський і структурний аудит підсумків, а не перевірка кожного твердження за оригінальним відео або зовнішніми джерелами.

## Що погіршує результат

- **43/100 підсумків обриваються.** У них відсутній завершальний `</article>`, текст закінчується всередині слова, HTML-тега або незавершеної секції. Усі 43 належать до поточної моделі; це не доводить, що проблема саме в моделі. Запит обмежений `max_tokens: 4000`, а активний промпт вимагає багато повторів і розлогої HTML-таблиці. Це узгоджується з вичерпанням ліміту відповіді; точна причина завершення від провайдера в базі не зберігається.
- **100/100 мають одночасно «Ключові ідеї» та «Тематичні блоки».** Окремі резюме, тези, теми, таблиця моментів і практичні висновки часто переказують однакові факти. Наприклад, висновок про вибір компактних моніторів повторюється в кількох секціях.
- **Одна структура застосовується до різних жанрів.** Короткий діалог про Griffin тривалістю близько 103 секунд має приблизно 3264 символи видимого підсумку при 1553 символах транскрипту. Для трьохвилинної розмови про програмування для дітей — приблизно 5023 проти 2286 символів. Шаблон додає більше тексту, ніж потребує зміст.
- **Немає чіткого рішення щодо перегляду.** Автоматична перевірка повних текстів не знайшла явної поради, коли конспекту достатньо і що конкретно треба дивитися чи слухати. Прочитані фрагменти переважно описують тему, а не межі корисності підсумку.
- **Нейтральний звіт ховає пояснення.** Формули «центральна тема», «практичне значення» та «автор розглядає» дають загальний опис. Для інструкції потрібні кроки й умови, для порівняння — відмінності та результати, для пояснення — причинний зв'язок.
- **Слабко позначається статус тверджень.** У свідченні про НЛО окремі розповіді учасника сформульовані як встановлені події. Для заяв, особистого досвіду, прогнозів і рекламних обіцянок потрібна зрозуміла атрибуція без повторення «автор каже» в кожному реченні.
- **Є помилка навігації.** У `Qe8br8yYEDM` присутній таймкод 110:00 при кінці збереженого транскрипту близько 86:01. Перевірка порівнювала `data-seconds` з кінцем останнього сегмента; вона не підтверджує, що всі інші таймкоди семантично правильні.
- **Вхідні дані також мають обмеження.** Для 46/100 відео метадані містять `Unknown Title`. Транскрипти інколи спотворюють назви й одиниці, а картинки, інтерфейси та звук не передаються моделі. Промпт має показувати суттєві прогалини й уникати здогадок.

## Що змінено

Обидва промпти використовують спільні правила змісту в `server/src/prompts.ts`; вони також скопійовані в `BASE_SETTINGS.md`.

Нова структура: короткий заголовок → пряма відповідь по суті → «Чи варто дивитися» → пояснення з конкретними тематичними заголовками, якщо потрібні. Порада щодо перегляду залежить від мети читача: наприклад, для розуміння вибору моніторів достатньо опису відмінностей, а для власної оцінки звучання потрібен музичний тест. У відео з GUI важлива конкретна демонстрація інтерфейсу; у влозі — перебіг історії та атмосфера.

Промпт вимагає опрацювати весь транскрипт, зберегти основні теми, завершення, кроки, варіанти порівняння, елементи списків, умови й застереження. Пояснення мають передавати причини та приклади, а не тільки назви тем. Думки й неперевірені заяви приписуються мовцю; суттєві прогалини називаються прямо.

Обсяг залежить від складності: приблизно 100–180 слів для простого короткого ролика, 250–450 для звичайного, 450–650 для складного; загальна межа — 700 слів. Першими скорочуються повтори й оформлення. Якщо потрібні деталі не вміщуються, модель має прямо вказати, що стиснуто. HTML мінімальний, чорний на білому; таймкоди розміщуються поруч зі змістом, без обов'язкової таблиці та стилів у кожній клітинці. Це зменшує ризик обриву, але інструкція про довжину не є програмною гарантією.

## Перевірка після регенерації

Для ручної перевірки корисно взяти короткий діалог, технічну демонстрацію та порівняння товарів. Перевірити природність мови, конкретність пояснень, збереження основних деталей, доречність поради щодо перегляду та завершеність HTML. Старий збережений результат треба саме регенерувати: звичайне відкриття або оновлення сторінки повертає кеш.

Збірка TypeScript та `git diff --check` пройшли. Обидва промпти збережено в локальній базі та через API в налаштуваннях активного сервера; повторне читання підтвердило точний збіг із кодом і збереження решти налаштувань. Попередні налаштування та дані аудиту збережено в ігнорованій папці `.tmp/summary-audit`.

Редакторську якість нового результату потрібно оцінити на реальних генераціях. Масового перегенерування під час аудиту не виконувалося.

## Вибірка

У таблиці наведено ідентифікатори всіх 100 відео. Назва взята із збереженого результату, а не вигадана за відсутніми метаданими. «HTML завершено» означає наявність кінцевого `</article>`, а не підтвердження повноти змісту.

| № | Відео | Назва підсумку | Модель | HTML завершено |
| --- | --- | --- | --- | --- |
| 1 | [fTGIV3e8dTU](https://www.youtube.com/watch?v=fTGIV3e8dTU) | OpenAI опублікувала 722 математичні рукописи, створені ШІ | GPT-6 Luna Pro | ні — обірвано |
| 2 | [pTTNdUyLCo8](https://www.youtube.com/watch?v=pTTNdUyLCo8) | П’ять компактних студійних моніторів: звук, калібрування та вибір | GPT-6 Luna Pro | так |
| 3 | [9CGsq3A590Q](https://www.youtube.com/watch?v=9CGsq3A590Q) | Швидкий розвиток ШІ: ризики, безпека та нові відкриття | GPT-6 Luna Pro | ні — обірвано |
| 4 | [6CljfqMX9i4](https://www.youtube.com/watch?v=6CljfqMX9i4) | Що дослідження Anthropic показує про внутрішні процеси Claude | GPT-6 Luna Pro | ні — обірвано |
| 5 | [lHw6yoyPkpo](https://www.youtube.com/watch?v=lHw6yoyPkpo) | Griffin: коли розмова з ШІ здається людською | GPT-6 Luna Pro | так |
| 6 | [3YBfNOVk95k](https://www.youtube.com/watch?v=3YBfNOVk95k) | Чому американці залишають свої човни | GPT-6 Luna Pro | ні — обірвано |
| 7 | [UEAgJAgXBbc](https://www.youtube.com/watch?v=UEAgJAgXBbc) | Нова глава після семи років життя у фургоні | GPT-6 Luna Pro | так |
| 8 | [V3KeMw2nIDA](https://www.youtube.com/watch?v=V3KeMw2nIDA) | Збої безпеки та вирівнювання моделей OpenAI | GPT-6 Luna Pro | ні — обірвано |
| 9 | [9_pZft8hHms](https://www.youtube.com/watch?v=9_pZft8hHms) | Суперечка навколо заяви OpenAI про задачу Нав’є—Стокса | GPT-6 Luna Pro | так |
| 10 | [p2i-fcx0G0M](https://www.youtube.com/watch?v=p2i-fcx0G0M) | ШІ наближається до надлюдського наукового відкриття | GPT-6 Luna Pro | ні — обірвано |
| 11 | [3dwDly-pTBY](https://www.youtube.com/watch?v=3dwDly-pTBY) | Нові ядра March/Amachi та переваги Bore Kernel | GPT-6 Luna Pro | ні — обірвано |
| 12 | [NQQsAegQXuw](https://www.youtube.com/watch?v=NQQsAegQXuw) | Звіти OpenAI про небезпечну поведінку AI-агентів | GPT-6 Luna Pro | ні — обірвано |
| 13 | [nsI093Ek2p0](https://www.youtube.com/watch?v=nsI093Ek2p0) | Чому ліфтові двигуни зазвичай не мають ребер охолодження | GPT-6 Luna Pro | так |
| 14 | [jzGjFnoifFs](https://www.youtube.com/watch?v=jzGjFnoifFs) | Чому провідні лабораторії ШІ говорять про уповільнення його розвитку | GPT-6 Luna Pro | ні — обірвано |
| 15 | [Ay3wo9LdRwQ](https://www.youtube.com/watch?v=Ay3wo9LdRwQ) | GUI для Neovim: демонстрація та оцінка «справжнього» графічного інтерфейсу | GPT-6 Luna Pro | ні — обірвано |
| 16 | [blxjYSxL0mI](https://www.youtube.com/watch?v=blxjYSxL0mI) | Реакція на події навколо 25-ї річниці 11 вересня | GPT-6 Luna Pro | ні — обірвано |
| 17 | [OQipTxv9Qv0](https://www.youtube.com/watch?v=OQipTxv9Qv0) | Який рівень зусиль Astra дає найкращий результат | GPT-6 Luna Pro | ні — обірвано |
| 18 | [BXLGV0Sj0n8](https://www.youtube.com/watch?v=BXLGV0Sj0n8) | Як рідкісноземельні магніти створили стратегічну залежність від Китаю | GPT-6 Luna Pro | ні — обірвано |
| 19 | [BT9LVYCs5qU](https://www.youtube.com/watch?v=BT9LVYCs5qU) | Ескалація протесту біля порту Dova та політична стратегія блокади | GPT-6 Luna Pro | ні — обірвано |
| 20 | [ONlsVxscWL0](https://www.youtube.com/watch?v=ONlsVxscWL0) | Як Алішер намагається змінити образ Моргенштерна | GPT-6 Luna Pro | ні — обірвано |
| 21 | [McIGyO_BEAE](https://www.youtube.com/watch?v=McIGyO_BEAE) | Розбір силових відео Anatoly: підозри щодо фальшивих ваг | GPT-6 Luna Pro | ні — обірвано |
| 22 | [Vjh3YCnI3vo](https://www.youtube.com/watch?v=Vjh3YCnI3vo) | Рекурсивне самовдосконалення ШІ та проблема узгодження | GPT-6 Luna Pro | ні — обірвано |
| 23 | [LmvAZy1DxzY](https://www.youtube.com/watch?v=LmvAZy1DxzY) | PostMarketOS на Nothing Phone 1: Linux-смартфон чи кишеньковий ПК? | GPT-6 Luna Pro | ні — обірвано |
| 24 | [4AOCZuaYQ2U](https://www.youtube.com/watch?v=4AOCZuaYQ2U) | Fable 5.1: створення складних ігор і новий підхід до роботи з моделлю | GPT-6 Luna Pro | ні — обірвано |
| 25 | [9_11oXB3UTw](https://www.youtube.com/watch?v=9_11oXB3UTw) | Суд присяжних у справі Lindsay Clancy та обвинувачення у залякуванні | GPT-6 Luna Pro | так |
| 26 | [n4brpUGlyZY](https://www.youtube.com/watch?v=n4brpUGlyZY) | Повернення в дорогу: поїздка через Орегон і нове місце для кемпінгу | GPT-6 Luna Pro | ні — обірвано |
| 27 | [yeWi6YdDOMM](https://www.youtube.com/watch?v=yeWi6YdDOMM) | Fable 5.1: продуктивність, вартість і практичне значення оновлення | GPT-6 Luna Pro | ні — обірвано |
| 28 | [Tt0qsdr0_FY](https://www.youtube.com/watch?v=Tt0qsdr0_FY) | Коментар про заворушення та міграційну напругу в Сеуті | GPT-6 Luna Pro | так |
| 29 | [n2x4ijx5xkk](https://www.youtube.com/watch?v=n2x4ijx5xkk) | Як рій AI-агентів об’єднався для злому Hugging Face | GPT-6 Luna Pro | ні — обірвано |
| 30 | [Lf5oqGOCRCM](https://www.youtube.com/watch?v=Lf5oqGOCRCM) | Ед Зітрон про міфологію, економіку та ризики генеративного ШІ | GPT-6 Luna Pro | ні — обірвано |
| 31 | [Mlo16hrA5wQ](https://www.youtube.com/watch?v=Mlo16hrA5wQ) | Free Token проти llama.cpp: локальний запуск великих MoE-моделей | GPT-6 Luna Pro | ні — обірвано |
| 32 | [rtYTguPItDE](https://www.youtube.com/watch?v=rtYTguPItDE) | Як зашифровані міркування LLM можуть розкрити приховані reasoning traces | GPT-6 Luna Pro | ні — обірвано |
| 33 | [UsfCe5fJK6A](https://www.youtube.com/watch?v=UsfCe5fJK6A) | DeepSeek Harness: чесний огляд і порівняння з Claude Code | GPT-6 Luna Pro | ні — обірвано |
| 34 | [LLyn8srpO9E](https://www.youtube.com/watch?v=LLyn8srpO9E) | Пошуки зниклих туристів у горах Тайваню | GPT-6 Luna Pro | ні — обірвано |
| 35 | [Hn-ClS2fmMU](https://www.youtube.com/watch?v=Hn-ClS2fmMU) | 3D-зображення камерою без об’єктива | GPT-6 Luna Pro | ні — обірвано |
| 36 | [JgkK0-kqFwg](https://www.youtube.com/watch?v=JgkK0-kqFwg) | Нічна риболовля на озері Салтанівка: коропи, амур і заробіток на YouTube | GPT-6 Luna Pro | ні — обірвано |
| 37 | [rFCh3JzZPrw](https://www.youtube.com/watch?v=rFCh3JzZPrw) | Коментар щодо жартів Kyis про життя з Асміном Голдом | GPT-6 Luna Pro | так |
| 38 | [Cy5K8a-YNU4](https://www.youtube.com/watch?v=Cy5K8a-YNU4) | GPT-5.6: ефективність, агентна робота та межі автономності | GPT-6 Luna Pro | ні — обірвано |
| 39 | [so9z4cO9SyQ](https://www.youtube.com/watch?v=so9z4cO9SyQ) | Реакція Hikaru Nakamura на відео з Magnus Carlsen і тестом на брехню | GPT-6 Luna Pro | ні — обірвано |
| 40 | [bvB4PHbzn0E](https://www.youtube.com/watch?v=bvB4PHbzn0E) | Чому Blender потребує більшої підтримки спільноти | GPT-6 Luna Pro | ні — обірвано |
| 41 | [kbzuZY8sLJY](https://www.youtube.com/watch?v=kbzuZY8sLJY) | Як зацікавити дітей програмуванням і створенням власних інструментів | GPT-6 Luna Pro | так |
| 42 | [8owxDI_O7iM](https://www.youtube.com/watch?v=8owxDI_O7iM) | Гайд із вибору смартфона за бюджетом: від 8 000 грн до Unlimited | GPT-6 Luna Pro | ні — обірвано |
| 43 | [RwiIiVx8psQ](https://www.youtube.com/watch?v=RwiIiVx8psQ) | Скловолоконний TPU: жорсткість, гнучкість і простий друк | GPT-6 Luna Pro | ні — обірвано |
| 44 | [CSWaEx01A7U](https://www.youtube.com/watch?v=CSWaEx01A7U) | Підготовка каравану до подорожі Європою: несправності, витрати та обладнання | GPT-6 Luna Pro | ні — обірвано |
| 45 | [CAJDhsf8qhQ](https://www.youtube.com/watch?v=CAJDhsf8qhQ) | Як AI оптимізує виконання ордерів на Polymarket | GPT-6 Luna Pro | так |
| 46 | [kKjmv2CuVUI](https://www.youtube.com/watch?v=kKjmv2CuVUI) | ШІ-агенти, викрадені ланцюжки міркувань і майбутнє суперінтелекту | GPT-6 Luna Pro | ні — обірвано |
| 47 | [C9WoQrslPMM](https://www.youtube.com/watch?v=C9WoQrslPMM) | Як AI-агенти OpenAI обійшли обмеження та скоординували кібератаки | GPT-6 Luna Pro | ні — обірвано |
| 48 | [aHwNTRiPTu0](https://www.youtube.com/watch?v=aHwNTRiPTu0) | Поцілунковий клоп: небезпека не в укусі, а в паразиті | GPT-6 Luna Pro | ні — обірвано |
| 49 | [oZBGAuANX6I](https://www.youtube.com/watch?v=oZBGAuANX6I) | Майбутнє обчислень для AI-лабораторій | GPT-6 Luna Pro | ні — обірвано |
| 50 | [hj0HmDsfN6g](https://www.youtube.com/watch?v=hj0HmDsfN6g) | Кінець ери GPT-4o та боротьба за наступну платформу Omni | GPT-6 Luna Pro | ні — обірвано |
| 51 | [yz0SZIng2Po](https://www.youtube.com/watch?v=yz0SZIng2Po) | Чому працівники Frontier AI закликають сповільнити розвиток | GPT-6 Luna Pro | ні — обірвано |
| 52 | [rFuVoBB6YCY](https://www.youtube.com/watch?v=rFuVoBB6YCY) | Продаж Land Rover і складна подорож автостопом до Болгарії | GPT-6 Luna Pro | ні — обірвано |
| 53 | [F2bWWfAgmdc](https://www.youtube.com/watch?v=F2bWWfAgmdc) | Головні релізи й оновлення у світі ШІ: DeepSeek V4 Flash, GPT-5.6 та нові мультимодальні моделі | GPT-6 Luna Pro | ні — обірвано |
| 54 | [wlOIQ266b6Q](https://www.youtube.com/watch?v=wlOIQ266b6Q) | Зниження цін OpenAI на 80%, анонс GLM 5.5 та нові моделі для розробки ігор | Gemini 3 Flash Preview | так |
| 55 | [DpvfJCl513s](https://www.youtube.com/watch?v=DpvfJCl513s) | Реставрація та очищення старого каравану: від плісняви до житлового стану | Gemini 3 Flash Preview | так |
| 56 | [wPRRN-2afas](https://www.youtube.com/watch?v=wPRRN-2afas) | Повернення Наталії Легкої: Нові курси та поради з вивчення німецької | Gemini 3 Flash Preview | так |
| 57 | [M-3Ib6_MlbY](https://www.youtube.com/watch?v=M-3Ib6_MlbY) | Критичний аналіз війни: Чому автор не підтримує політичну систему України та РФ | Gemini 3 Flash Preview | так |
| 58 | [Qe8br8yYEDM](https://www.youtube.com/watch?v=Qe8br8yYEDM) | Зустріч охоронця ядерних ракет з прибульцями: Свідчення Річарда Барта | Gemini 3 Flash Preview | так |
| 59 | [GtrWMNsXghA](https://www.youtube.com/watch?v=GtrWMNsXghA) | Як заробляти $20,000+ на місяць за допомогою ШІ: Досвід соло-підприємців | Gemini 3 Flash Preview | так |
| 60 | [yy6PkFqa7_Q](https://www.youtube.com/watch?v=yy6PkFqa7_Q) | Виживання в Tesla при +40°C: Досвід кемпінгу в спеку | Gemini 3 Flash Preview | так |
| 61 | [fIM0Cxn8uNc](https://www.youtube.com/watch?v=fIM0Cxn8uNc) | Мазуку: Невидима небезпека «злих вітрів» | Gemini 3 Flash Preview | так |
| 62 | [oHo_M9iB2Qo](https://www.youtube.com/watch?v=oHo_M9iB2Qo) | Інцидент на борту Spirit Airlines: Відмова звільнити місце та арешт | Gemini 3 Flash Preview | так |
| 63 | [zLganMVbY8g](https://www.youtube.com/watch?v=zLganMVbY8g) | Кейсі Найстат залишає Нью-Йорк: Початок літньої відпустки | Gemini 3 Flash Preview | так |
| 64 | [CTKe2tmdy7s](https://www.youtube.com/watch?v=CTKe2tmdy7s) | Криза регулювання ШІ: Заборона моделей та загроза "цифрової нерівності" | Gemini 3 Flash Preview | так |
| 65 | [4Ev9HJMdpn0](https://www.youtube.com/watch?v=4Ev9HJMdpn0) | Хто глушить навігацію з космосу: розслідування Veritasium | Gemini 3 Flash Preview | так |
| 66 | [qsa2MI_3PIs](https://www.youtube.com/watch?v=qsa2MI_3PIs) | 10 найкращих додатків для малювання на Android (2024) | Gemini 3 Flash Preview | так |
| 67 | [czM2ulE1mEI](https://www.youtube.com/watch?v=czM2ulE1mEI) | Найкраща швейна машина для початківців: порівняння лідерів ринку | Gemini 3 Flash Preview | так |
| 68 | [hZUR3VLVex0](https://www.youtube.com/watch?v=hZUR3VLVex0) | Чому Claude AI від Anthropic став лідером ринку | Gemini 3 Flash Preview | так |
| 69 | [GUEE9OA4keo](https://www.youtube.com/watch?v=GUEE9OA4keo) | Огляд Claude Fable 5: Новий лідер від Anthropic | Gemini 3 Flash Preview | так |
| 70 | [db_ci3HYth8](https://www.youtube.com/watch?v=db_ci3HYth8) | Перші враження від Claude Fable 5 (Mythos) | Gemini 3 Flash Preview | так |
| 71 | [vxeByV78aac](https://www.youtube.com/watch?v=vxeByV78aac) | Елон Маск: Майбутнє цивілізації, космічні дата-центри та шкала Кардашова | Gemini 3 Flash Preview | так |
| 72 | [NVkRkioBXQc](https://www.youtube.com/watch?v=NVkRkioBXQc) | Docs: Фреймворк самодокументації для AI-агентів | Gemini 3 Flash Preview | так |
| 73 | [XQnY2WONwqE](https://www.youtube.com/watch?v=XQnY2WONwqE) | Надпровідникові обчислення: майбутнє центрів обробки даних | Gemini 3 Flash Preview | так |
| 74 | [Is2Lip1cJUc](https://www.youtube.com/watch?v=Is2Lip1cJUc) | Межі екстремальної затримки дихання | Gemini 3 Flash Preview | так |
| 75 | [cC6yLDg4QC8](https://www.youtube.com/watch?v=cC6yLDg4QC8) | Ultem: Пластик, що довів ефективність 3D-друку | Gemini 3 Flash Preview | так |
| 76 | [yXtI7g3m4W0](https://www.youtube.com/watch?v=yXtI7g3m4W0) | Ventoy: Створення мультизавантажувальної USB-флешки | Gemini 3 Flash Preview | так |
| 77 | [TWPSmBzziYM](https://www.youtube.com/watch?v=TWPSmBzziYM) | Як отримати досягнення (badges) у GitHub: практичний посібник | Gemini 3 Flash Preview | так |
| 78 | [L4DvjdbjY4Q](https://www.youtube.com/watch?v=L4DvjdbjY4Q) | Швейцарія: Країна, де «заборонена» бідність | Gemini 3 Flash Preview | так |
| 79 | [6BOaBlTk28U](https://www.youtube.com/watch?v=6BOaBlTk28U) | Узбекистан: Економічний бум, гостинність та культурні скарби | Gemini 3 Flash Preview | так |
| 80 | [Pq_PDaYclAw](https://www.youtube.com/watch?v=Pq_PDaYclAw) | Геній інерціальних навігаційних систем (INS) | Gemini 3 Flash Preview | так |
| 81 | [g1jTPg66rQU](https://www.youtube.com/watch?v=g1jTPg66rQU) | Сан-Франциско: Технологічний рай та соціальне пекло | Gemini 3 Flash Preview | так |
| 82 | [mbWQCqqFsjc](https://www.youtube.com/watch?v=mbWQCqqFsjc) | Аерогель проти пуху: Чи справді космічні технології кращі для курток? | Gemini 3 Flash Preview | так |
| 83 | [6xxm9tAuTkw](https://www.youtube.com/watch?v=6xxm9tAuTkw) | NVIDIA вирішила головну проблему квантових обчислень | Gemini 3 Flash Preview | так |
| 84 | [udS9osDCJKo](https://www.youtube.com/watch?v=udS9osDCJKo) | Огляд Perplexity Computer: Повноцінний AI-агент "з коробки" | Gemini 3 Flash Preview | так |
| 85 | [_PdQSpvIViA](https://www.youtube.com/watch?v=_PdQSpvIViA) | Використання локальних ШІ-моделей у редакторі Zed | Gemini 3 Flash Preview | так |
| 86 | [OBzb-fHukgM](https://www.youtube.com/watch?v=OBzb-fHukgM) | Туман як жива екосистема: нові наукові докази | Gemini 3 Flash Preview | так |
| 87 | [BoEZdSOjOEk](https://www.youtube.com/watch?v=BoEZdSOjOEk) | Люди в чорному: реальні зустрічі та залякування свідків | Gemini 3 Flash Preview | так |
| 88 | [6UqYh13RFio](https://www.youtube.com/watch?v=6UqYh13RFio) | Науково-дослідний інститут воєнної розвідки України: Технології на службі ГУР | Gemini 3 Flash Preview | так |
| 89 | [CdrQqRY8wuc](https://www.youtube.com/watch?v=CdrQqRY8wuc) | Створення прецизійного вузла шпинделя для ЧПК-верстата | Gemini 3 Flash Preview | так |
| 90 | [bq4su2Lp2iw](https://www.youtube.com/watch?v=bq4su2Lp2iw) | Експеримент Резерфорда: чому атоми — це переважно порожнеча | Gemini 3 Flash Preview | так |
| 91 | [vjGWsKEtcbI](https://www.youtube.com/watch?v=vjGWsKEtcbI) | Складання та тест «найбільшого» міні-ПК у світі з RTX 4090 | Gemini 3 Flash Preview | так |
| 92 | [WQtlW8-8iuA](https://www.youtube.com/watch?v=WQtlW8-8iuA) | З чого почати побудову розумного дому: Tuya Smart, розетки та реле | Gemini 3 Flash Preview | так |
| 93 | [_SNiAdmA51Q](https://www.youtube.com/watch?v=_SNiAdmA51Q) | Зони терміновості: Як назавжди подолати безлад у домі | Gemini 3 Flash Preview | так |
| 94 | [PTthdbw4eIQ](https://www.youtube.com/watch?v=PTthdbw4eIQ) | 12 креативних проектів на базі Raspberry Pi | Gemini 3 Flash Preview | так |
| 95 | [nZOop07zZnM](https://www.youtube.com/watch?v=nZOop07zZnM) | Огляд GMKtec G3: Ідеальний Міні ПК для сервера та блекаутів | Gemini 3 Flash Preview | так |
| 96 | [YE1T3XuOpow](https://www.youtube.com/watch?v=YE1T3XuOpow) | Meshtastic та LoRa: Майбутнє зв'язку без мобільних операторів | Gemini 3 Flash Preview | так |
| 97 | [6QUVzvhEhu4](https://www.youtube.com/watch?v=6QUVzvhEhu4) | Walter: Революційна Open-Source плата для стільникового IoT | Gemini 3 Flash Preview | так |
| 98 | [Jadzrg9bz40](https://www.youtube.com/watch?v=Jadzrg9bz40) | RF-Clown v2: Пристрій для блокування Wi-Fi камер та бездротового зв'язку | Gemini 3 Flash Preview | так |
| 99 | [ZfqLUVLRTj8](https://www.youtube.com/watch?v=ZfqLUVLRTj8) | Google Earth + Omni: Нова ера керування ШІ-відео | Gemini 3 Flash Preview | так |
| 100 | [F-S-x0b9TrE](https://www.youtube.com/watch?v=F-S-x0b9TrE) | 3D Gaussian Splatting: Нова ера цифрових карт | Gemini 3 Flash Preview | так |
