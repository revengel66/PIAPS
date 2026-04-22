-- Полный пересид данных для курсового проекта
-- Используются только автоинкрементные ID (ручные id не задаются).

ALTER TABLE faculties DROP COLUMN IF EXISTS code;
ALTER TABLE faculties ADD COLUMN IF NOT EXISTS short_name varchar(32);
ALTER TABLE directions ADD COLUMN IF NOT EXISTS short_name varchar(16);
ALTER TABLE directions ADD COLUMN IF NOT EXISTS annual_tuition numeric(12,2);
ALTER TABLE directions
    ALTER COLUMN annual_tuition TYPE numeric(12,2)
    USING (
        CASE
            WHEN annual_tuition IS NULL THEN NULL
            ELSE NULLIF(
                regexp_replace(
                    replace(annual_tuition::text, ',', '.'),
                    '[^0-9\\.]',
                    '',
                    'g'
                ),
                ''
            )::numeric(12,2)
        END
    );
ALTER TABLE student_groups ADD COLUMN IF NOT EXISTS education_level varchar(16);
ALTER TABLE student_groups ADD COLUMN IF NOT EXISTS education_form varchar(16);
ALTER TABLE student_groups ADD COLUMN IF NOT EXISTS accelerated boolean;
ALTER TABLE student_groups ADD COLUMN IF NOT EXISTS group_number integer;
ALTER TABLE students ADD COLUMN IF NOT EXISTS education_form varchar(32);
ALTER TABLE students ADD COLUMN IF NOT EXISTS education_base varchar(32);
ALTER TABLE students ADD COLUMN IF NOT EXISTS has_academic_debts boolean;
ALTER TABLE students ADD COLUMN IF NOT EXISTS study_contract_number varchar(128);
ALTER TABLE students ADD COLUMN IF NOT EXISTS study_start_date date;
ALTER TABLE students ALTER COLUMN has_academic_debts SET DEFAULT false;
UPDATE students SET has_academic_debts = false WHERE has_academic_debts IS NULL;
ALTER TABLE students DROP COLUMN IF EXISTS enrollment_date;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE students
    ADD CONSTRAINT students_status_check
    CHECK (status IN ('NEW', 'ACTIVE', 'ACADEMIC_LEAVE', 'EXPELLED', 'GRADUATED'));
ALTER TABLE student_state_history DROP CONSTRAINT IF EXISTS student_state_history_status_check;
ALTER TABLE student_state_history DROP CONSTRAINT IF EXISTS student_state_history_check;
ALTER TABLE student_state_history
    ADD CONSTRAINT student_state_history_status_check
    CHECK (status IN ('NEW', 'ACTIVE', 'ACADEMIC_LEAVE', 'EXPELLED', 'GRADUATED'));
ALTER TABLE curriculums ADD COLUMN IF NOT EXISTS education_level varchar(16);
ALTER TABLE curriculums ADD COLUMN IF NOT EXISTS education_form varchar(16);
ALTER TABLE curriculums ADD COLUMN IF NOT EXISTS accelerated boolean;
ALTER TABLE curriculums ADD COLUMN IF NOT EXISTS plan_year integer;
UPDATE curriculums SET plan_year = extract(year from current_date)::int WHERE plan_year IS NULL;
ALTER TABLE curriculums ALTER COLUMN plan_year SET NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS executed boolean;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS executed_at date;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS execution_snapshot_json varchar(20000);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS signed boolean;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS signed_at date;
ALTER TABLE orders ALTER COLUMN executed SET DEFAULT false;
UPDATE orders SET executed = false WHERE executed IS NULL;
UPDATE orders SET signed = false WHERE signed IS NULL;
ALTER TABLE curriculums DROP CONSTRAINT IF EXISTS uq_curriculum_course_discipline_direction;
ALTER TABLE curriculums DROP CONSTRAINT IF EXISTS uq_curriculum_plan_scope;
DROP INDEX IF EXISTS uq_curriculum_course_discipline_direction;
DROP INDEX IF EXISTS uq_curriculum_plan_scope;
-- Важно: блок DO $$ ... $$ не используем, т.к. Spring SQL initializer
-- выполняет data.sql построчно и не поддерживает безопасно такие конструкции.

TRUNCATE TABLE student_state_history, orders, students, curriculums, student_groups, directions, faculties RESTART IDENTITY CASCADE;

DROP INDEX IF EXISTS uq_students_record_book_seed;
DROP INDEX IF EXISTS uq_students_contract_seed;
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_record_book_seed ON students(record_book);
CREATE UNIQUE INDEX IF NOT EXISTS uq_students_contract_seed ON students(study_contract_number);

-- =========================================================
-- 1) Факультеты: 5
-- =========================================================
INSERT INTO faculties (name, short_name)
VALUES
    ('информационных технологий', 'ФИТ'),
    ('радиотехники и систем связи', 'ФРСС'),
    ('энергетики и мехатроники', 'ФЭМ'),
    ('авиационных систем', 'ФАС'),
    ('экономики и управления', 'ФЭУ');

-- =========================================================
-- 2) Направления: 10 в каждом факультете (всего 50)
-- =========================================================
WITH faculty_ranked AS (
    SELECT
        id,
        row_number() OVER (ORDER BY id) AS f_idx
    FROM faculties
),
direction_seed AS (
    SELECT * FROM (VALUES
        -- FIIT
        ('FIIT', 1,  'Программная инженерия',                                                   'ПИ',   'бд'),
        ('FIIT', 2,  'Информатика и вычислительная техника',                                    'ИВТ',  'бд'),
        ('FIIT', 3,  'Информационные системы и технологии',                                     'ИСТ',  'бд'),
        ('FIIT', 4,  'Прикладная информатика',                                                  'ПИН',  'бд'),
        ('FIIT', 5,  'Математическое моделирование и машинное обучение',                        'МММ',  'бд'),
        ('FIIT', 6,  'Искусственный интеллект и анализ данных',                                 'ИАД',  'бд'),
        ('FIIT', 7,  'Системный анализ и управление',                                           'САУ',  'бд'),
        ('FIIT', 8,  'Разработка веб- и мобильных приложений',                                  'ВМП',  'бд'),
        ('FIIT', 9,  'Программно-аппаратные комплексы',                                         'ПАК',  'бд'),
        ('FIIT', 10, 'Технологии виртуальной и дополненной реальности',                         'ВРТ',  'бд'),

        -- FRTS
        ('FRTS', 1,  'Радиотехника',                                                            'РТХ',  'бд'),
        ('FRTS', 2,  'Инфокоммуникационные технологии и системы связи',                         'ИКС',  'бд'),
        ('FRTS', 3,  'Конструирование и технология электронных средств',                        'КТЭ',  'бд'),
        ('FRTS', 4,  'Электроника и наноэлектроника',                                           'ЭНЭ',  'бд'),
        ('FRTS', 5,  'Фотоника и оптоинформатика',                                              'ФОИ',  'бд'),
        ('FRTS', 6,  'Микроэлектроника и твердотельная электроника',                            'МТЭ',  'бд'),
        ('FRTS', 7,  'Робототехнические и сенсорные системы',                                   'РСС',  'бд'),
        ('FRTS', 8,  'Приборостроение',                                                         'ПРБ',  'бд'),
        ('FRTS', 9,  'Квантовые коммуникации',                                                  'КВК',  'бд'),
        ('FRTS', 10, 'Медицинская электроника',                                                 'МЭЛ',  'бд'),

        -- FEM
        ('FEM',  1,  'Электроэнергетика и электротехника',                                      'ЭЭТ',  'бд'),
        ('FEM',  2,  'Теплоэнергетика и теплотехника',                                          'ТЭТ',  'бд'),
        ('FEM',  3,  'Мехатроника и робототехника',                                             'МХР',  'бд'),
        ('FEM',  4,  'Автоматизация технологических процессов и производств',                   'АТП',  'бд'),
        ('FEM',  5,  'Энергетическое машиностроение',                                           'ЭМШ',  'бд'),
        ('FEM',  6,  'Техническая физика',                                                      'ТФЗ',  'бд'),
        ('FEM',  7,  'Ядерная энергетика и теплофизика',                                        'ЯЭТ',  'бд'),
        ('FEM',  8,  'Промышленная экология и безопасность',                                    'ПЭБ',  'бд'),
        ('FEM',  9,  'Инженерная экология и мониторинг',                                        'ИЭМ',  'бд'),
        ('FEM',  10, 'Устойчивые энергетические системы',                                       'УЭС',  'бд'),

        -- FAS
        ('FAS',  1,  'Авиастроение',                                                            'А',    'бд'),
        ('FAS',  2,  'Двигатели летательных аппаратов',                                         'ДЛА',  'бд'),
        ('FAS',  3,  'Беспилотные авиационные системы',                                         'БАС',  'бд'),
        ('FAS',  4,  'Системы управления летательными аппаратами',                              'СУЛ',  'бд'),
        ('FAS',  5,  'Аэродинамика и гидроаэродинамика',                                        'АГД',  'бд'),
        ('FAS',  6,  'Композитные материалы в авиастроении',                                    'КМА',  'бд'),
        ('FAS',  7,  'Проектирование авиационных комплексов',                                   'ПАКО', 'бд'),
        ('FAS',  8,  'Навигация и управление движением',                                         'НУД',  'бд'),
        ('FAS',  9,  'Техническая эксплуатация авиационной техники',                            'ТЭА',  'бд'),
        ('FAS',  10, 'Цифровое производство в авиастроении',                                    'ЦПА',  'бд'),

        -- FEC
        ('FEC',  1,  'Экономика',                                                               'ЭКН',  'бд'),
        ('FEC',  2,  'Менеджмент',                                                              'МЕН',  'бд'),
        ('FEC',  3,  'Финансы и кредит',                                                        'ФКР',  'бд'),
        ('FEC',  4,  'Бухгалтерский учет, анализ и аудит',                                      'БУА',  'бд'),
        ('FEC',  5,  'Маркетинг',                                                               'МАР',  'бд'),
        ('FEC',  6,  'Логистика и управление цепями поставок',                                  'ЛЦП',  'бд'),
        ('FEC',  7,  'Бизнес-информатика',                                                      'БИН',  'бд'),
        ('FEC',  8,  'Государственное и муниципальное управление',                              'ГМУ',  'бд'),
        ('FEC',  9,  'Управление персоналом',                                                   'УПР',  'бд'),
        ('FEC',  10, 'Предпринимательство и цифровой бизнес',                                   'ПЦБ',  'бд'),

        -- FHS
        ('FHS',  1,  'Социология',                                                              'СОЦ',  'бд'),
        ('FHS',  2,  'Психология',                                                              'ПСХ',  'бд'),
        ('FHS',  3,  'Юриспруденция',                                                           'ЮРС',  'бд'),
        ('FHS',  4,  'Международные отношения',                                                 'МЖО',  'бд'),
        ('FHS',  5,  'Политология',                                                             'ПОЛ',  'бд'),
        ('FHS',  6,  'История',                                                                 'ИСТР', 'бд'),
        ('FHS',  7,  'Философия',                                                               'ФИЛ',  'бд'),
        ('FHS',  8,  'Культурология',                                                           'КУЛ',  'бд'),
        ('FHS',  9,  'Реклама и связи с общественностью',                                       'РСО',  'бд'),
        ('FHS',  10, 'Туризм',                                                                  'ТУР',  'бд'),

        -- FCB
        ('FCB',  1,  'Информационная безопасность',                                             'ИБЗ',  'бд'),
        ('FCB',  2,  'Кибербезопасность',                                                       'КБЗ',  'бд'),
        ('FCB',  3,  'Защита информации в телекоммуникациях',                                   'ЗИТ',  'бд'),
        ('FCB',  4,  'Криптография',                                                            'КРП',  'бд'),
        ('FCB',  5,  'Цифровая криминалистика',                                                 'ЦКР',  'бд'),
        ('FCB',  6,  'Безопасность распределённых систем',                                      'БРС',  'бд'),
        ('FCB',  7,  'Безопасность больших данных',                                             'ББД',  'бд'),
        ('FCB',  8,  'Комплаенс и аудит информационной безопасности',                           'КАИ',  'бд'),
        ('FCB',  9,  'Управление инцидентами информационной безопасности',                      'УИИБ', 'бд'),
        ('FCB',  10, 'Безопасная разработка программного обеспечения',                          'БРП',  'бд'),

        -- FCM
        ('FCM',  1,  'Биомедицинская инженерия',                                                'БМИ',  'бд'),
        ('FCM',  2,  'Медицинская кибернетика',                                                 'МКБ',  'бд'),
        ('FCM',  3,  'Цифровая медицина',                                                       'ЦМД',  'бд'),
        ('FCM',  4,  'Биоинформатика',                                                          'БИНФ', 'бд'),
        ('FCM',  5,  'Геномные технологии',                                                     'ГТХ',  'бд'),
        ('FCM',  6,  'Нейротехнологии',                                                         'НТХ',  'бд'),
        ('FCM',  7,  'Медицинская робототехника',                                               'МРБ',  'бд'),
        ('FCM',  8,  'Тканевая инженерия',                                                      'ТИН',  'бд'),
        ('FCM',  9,  'Клинические данные и аналитика',                                          'КДА',  'бд'),
        ('FCM',  10, 'Фармацевтическая инженерия',                                              'ФИНЖ', 'бд'),

        -- FST
        ('FST',  1,  'Промышленное и гражданское строительство',                                'ПГС',  'бд'),
        ('FST',  2,  'Строительство уникальных зданий и сооружений',                            'СУЗ',  'бд'),
        ('FST',  3,  'Транспортное строительство',                                              'ТРС',  'бд'),
        ('FST',  4,  'Автомобильные дороги и аэродромы',                                        'АДА',  'бд'),
        ('FST',  5,  'Городское строительство и хозяйство',                                     'ГСХ',  'бд'),
        ('FST',  6,  'Геодезия и дистанционное зондирование',                                   'ГДЗ',  'бд'),
        ('FST',  7,  'Технология строительных материалов',                                      'ТСМ',  'бд'),
        ('FST',  8,  'Логистика и транспортные системы',                                        'ЛТС',  'бд'),
        ('FST',  9,  'Подъемно-транспортные машины и комплексы',                                'ПТМ',  'бд'),
        ('FST',  10, 'Инженерные сети и коммуникации',                                          'ИСК',  'бд'),

        -- FLC
        ('FLC',  1,  'Лингвистика',                                                             'ЛИН',  'бд'),
        ('FLC',  2,  'Перевод и переводоведение',                                               'ППВ',  'бд'),
        ('FLC',  3,  'Теория и методика преподавания иностранных языков',                       'ТМП',  'бд'),
        ('FLC',  4,  'Межкультурная коммуникация',                                              'МКК',  'бд'),
        ('FLC',  5,  'Филология',                                                               'ФЛГ',  'бд'),
        ('FLC',  6,  'Прикладная лингвистика',                                                  'ПЛГ',  'бд'),
        ('FLC',  7,  'Цифровая лингвистика',                                                    'ЦЛГ',  'бд'),
        ('FLC',  8,  'Международная журналистика',                                              'МЖР',  'бд'),
        ('FLC',  9,  'Медиакоммуникации',                                                       'МДК',  'бд'),
        ('FLC',  10, 'Связи с общественностью в международной среде',                           'СМС',  'бд')
    ) AS t(faculty_code, dir_idx, dir_name, dir_abbr, degree_tag)
)
INSERT INTO directions (code, name, short_name, faculty_id, annual_tuition)
SELECT
    lpad(fr.f_idx::text, 2, '0') || '.03.' || lpad(ds.dir_idx::text, 2, '0') AS code,
    ds.dir_name AS name,
    ds.dir_abbr AS short_name,
    fr.id AS faculty_id,
    (90000 + fr.f_idx * 7000 + ds.dir_idx * 1800)::numeric(12,2) AS annual_tuition
FROM direction_seed ds
JOIN faculty_ranked fr ON fr.f_idx = CASE ds.faculty_code
    WHEN 'FIIT' THEN 1
    WHEN 'FRTS' THEN 2
    WHEN 'FEM' THEN 3
    WHEN 'FAS' THEN 4
    WHEN 'FEC' THEN 5
    WHEN 'FHS' THEN 6
    WHEN 'FCB' THEN 7
    WHEN 'FCM' THEN 8
    WHEN 'FST' THEN 9
    WHEN 'FLC' THEN 10
END;

-- =========================================================
-- 3) Группы
--    3.1 Базовые: в каждом направлении по 3 группы очного бакалавриата (бд) каждого курса (1..4)
--    3.2 Дополнительные форматы для 50% направлений:
--        бв, бз, бду, бву, бзу,
--        мд, мв, мз, мду, мву, мзу,
--        сд, св, сз, сду, сву, сзу
-- =========================================================
WITH d AS (
    SELECT
        id AS direction_id,
        short_name AS group_prefix
    FROM directions
)
INSERT INTO student_groups (code, course, education_level, education_form, accelerated, group_number, direction_id)
SELECT
    d.group_prefix || 'бд-' || c::text || g::text AS code,
    c AS course,
    'BACHELOR' AS education_level,
    'FULL_TIME' AS education_form,
    false AS accelerated,
    g AS group_number,
    d.direction_id AS direction_id
FROM d
CROSS JOIN generate_series(1, 4) AS c
CROSS JOIN generate_series(1, 3) AS g;

WITH selected_directions AS (
    SELECT
        id AS direction_id,
        short_name AS group_prefix
    FROM directions
    WHERE mod(id, 2) = 0
),
variants AS (
    SELECT *
    FROM (VALUES
        ('BACHELOR',   'PART_TIME', false, 1, 4, 'б', 'в', ''),
        ('BACHELOR',   'DISTANCE',  false, 1, 4, 'б', 'з', ''),
        ('BACHELOR',   'FULL_TIME', true,  1, 3, 'б', 'д', 'у'),
        ('BACHELOR',   'PART_TIME', true,  1, 3, 'б', 'в', 'у'),
        ('BACHELOR',   'DISTANCE',  true,  1, 3, 'б', 'з', 'у'),

        ('MASTER',     'FULL_TIME', false, 1, 2, 'м', 'д', ''),
        ('MASTER',     'PART_TIME', false, 1, 2, 'м', 'в', ''),
        ('MASTER',     'DISTANCE',  false, 1, 2, 'м', 'з', ''),
        ('MASTER',     'FULL_TIME', true,  1, 1, 'м', 'д', 'у'),
        ('MASTER',     'PART_TIME', true,  1, 1, 'м', 'в', 'у'),
        ('MASTER',     'DISTANCE',  true,  1, 1, 'м', 'з', 'у'),

        ('SPECIALIST', 'FULL_TIME', false, 1, 5, 'с', 'д', ''),
        ('SPECIALIST', 'PART_TIME', false, 1, 5, 'с', 'в', ''),
        ('SPECIALIST', 'DISTANCE',  false, 1, 5, 'с', 'з', ''),
        ('SPECIALIST', 'FULL_TIME', true,  1, 4, 'с', 'д', 'у'),
        ('SPECIALIST', 'PART_TIME', true,  1, 4, 'с', 'в', 'у'),
        ('SPECIALIST', 'DISTANCE',  true,  1, 4, 'с', 'з', 'у')
    ) AS t(education_level, education_form, accelerated, course_from, course_to, level_suffix, form_suffix, accelerated_suffix)
),
generated AS (
    SELECT
        sd.direction_id,
        sd.group_prefix,
        v.education_level,
        v.education_form,
        v.accelerated,
        gs.course::int AS course,
        1 AS group_number,
        sd.group_prefix || v.level_suffix || v.form_suffix || v.accelerated_suffix || '-' || gs.course::text || '1' AS code
    FROM selected_directions sd
    CROSS JOIN variants v
    CROSS JOIN LATERAL generate_series(v.course_from, v.course_to) AS gs(course)
)
INSERT INTO student_groups (code, course, education_level, education_form, accelerated, group_number, direction_id)
SELECT
    g.code,
    g.course,
    g.education_level,
    g.education_form,
    g.accelerated,
    g.group_number,
    g.direction_id
FROM generated g
ORDER BY g.direction_id, g.code;

-- =========================================================
-- 4) Учебные планы:
--    - история по годам актуальности (plan_year)
--    - у каждого направления 2-3 редакции за период 2020..2028
-- =========================================================
WITH group_variants AS (
    SELECT DISTINCT
        g.direction_id,
        coalesce(g.education_level, 'BACHELOR') AS education_level,
        coalesce(g.education_form, 'FULL_TIME') AS education_form,
        coalesce(g.accelerated, false) AS accelerated
    FROM student_groups g
),
direction_meta AS (
    SELECT
        d.id AS direction_id,
        d.code AS direction_code,
        d.short_name AS direction_short_name,
        d.name AS direction_name,
        CASE split_part(d.code, '.', 1)
            WHEN '01' THEN 'IT'
            WHEN '02' THEN 'RADIO'
            WHEN '03' THEN 'ENERGY'
            WHEN '04' THEN 'AVIATION'
            WHEN '05' THEN 'ECON'
            WHEN '06' THEN 'HUMAN'
            WHEN '07' THEN 'CYBER'
            WHEN '08' THEN 'MED'
            WHEN '09' THEN 'CONSTRUCT'
            WHEN '10' THEN 'LINGUA'
            ELSE 'IT'
        END AS profile_track
    FROM directions d
),
disc_core_bachelor AS (
    SELECT *
    FROM (VALUES
        (1, 1, 'Высшая математика I', 144, 'Экзамен', false),
        (1, 1, 'Иностранный язык I', 108, 'Зачёт', false),
        (1, 2, 'Высшая математика II', 144, 'Экзамен', false),
        (1, 2, 'Программирование', 126, 'Экзамен', true),
        (2, 3, 'Алгоритмы и структуры данных', 126, 'Экзамен', true),
        (2, 3, 'Дискретная математика', 108, 'Экзамен', false),
        (2, 4, 'Базы данных', 126, 'Экзамен', true),
        (2, 4, 'Операционные системы', 108, 'Экзамен', true),
        (3, 5, 'Экономика отрасли', 90, 'Зачёт', false),
        (3, 5, 'Правовые основы профессиональной деятельности', 72, 'Зачёт', false),
        (3, 6, 'Управление проектами', 108, 'Экзамен', true),
        (3, 6, 'Информационная безопасность', 108, 'Экзамен', false),
        (4, 7, 'Производственная практика', 216, 'Зачёт с оценкой', false),
        (4, 7, 'Научно-исследовательский семинар', 72, 'Зачёт', false),
        (4, 8, 'Преддипломная практика', 216, 'Зачёт с оценкой', false),
        (4, 8, 'Государственная итоговая аттестация', 108, 'Экзамен', false)
    ) AS t(course, semester, discipline, hours, attestation, course_work)
),
disc_core_specialist_extra AS (
    SELECT *
    FROM (VALUES
        (5, 9, 'Отраслевые информационные системы', 126, 'Экзамен', true),
        (5, 9, 'Надежность и качество технических систем', 108, 'Зачёт', false),
        (5, 9, 'Проектная практика', 144, 'Зачёт с оценкой', false),
        (5, 10, 'Преддипломная практика', 216, 'Зачёт с оценкой', false),
        (5, 10, 'Подготовка и защита выпускной работы специалиста', 216, 'Зачёт', false),
        (5, 10, 'Государственный междисциплинарный экзамен', 108, 'Экзамен', false),
        (5, 10, 'Государственная итоговая аттестация', 108, 'Экзамен', false)
    ) AS t(course, semester, discipline, hours, attestation, course_work)
),
disc_core_master AS (
    SELECT *
    FROM (VALUES
        (1, 1, 'Методология научных исследований', 108, 'Экзамен', false),
        (1, 1, 'Академическое письмо и коммуникации', 72, 'Зачёт', false),
        (1, 2, 'Управление исследовательскими проектами', 96, 'Экзамен', false),
        (1, 2, 'Практика образовательной программы', 144, 'Зачёт с оценкой', false),
        (2, 3, 'Научно-исследовательская работа', 216, 'Зачёт с оценкой', false),
        (2, 3, 'Профессиональный иностранный язык', 72, 'Зачёт', false),
        (2, 4, 'Преддипломная практика', 216, 'Зачёт с оценкой', false),
        (2, 4, 'Государственная итоговая аттестация', 108, 'Экзамен', false)
    ) AS t(course, semester, discipline, hours, attestation, course_work)
),
profile_bachelor AS (
    SELECT
        dm.direction_id,
        p.course,
        p.semester,
        p.base_title || ' [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']' AS discipline,
        p.hours,
        p.attestation,
        p.course_work
    FROM direction_meta dm
    JOIN (
        VALUES
            ('IT', 1, 1, 'Введение в программную инженерию', 108, 'Зачёт', false),
            ('IT', 1, 2, 'Архитектура цифровых решений', 126, 'Экзамен', true),
            ('IT', 2, 3, 'Машинное обучение и аналитика данных', 126, 'Экзамен', true),
            ('IT', 2, 4, 'Разработка веб- и мобильных приложений', 126, 'Экзамен', true),
            ('IT', 3, 5, 'Облачные платформы и DevOps', 108, 'Экзамен', false),
            ('IT', 3, 6, 'Интеллектуальные сервисы и NLP', 108, 'Экзамен', true),
            ('IT', 4, 7, 'Проектный практикум', 180, 'Зачёт с оценкой', true),
            ('IT', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('RADIO', 1, 1, 'Теория электрических цепей', 108, 'Экзамен', false),
            ('RADIO', 1, 2, 'Схемотехника и электроника', 126, 'Экзамен', true),
            ('RADIO', 2, 3, 'Цифровая обработка сигналов', 126, 'Экзамен', true),
            ('RADIO', 2, 4, 'Радиосистемы и антенны', 126, 'Экзамен', true),
            ('RADIO', 3, 5, 'Телекоммуникационные протоколы', 108, 'Экзамен', false),
            ('RADIO', 3, 6, 'Встраиваемые радиосистемы', 108, 'Экзамен', true),
            ('RADIO', 4, 7, 'Проектирование радиоэлектронных устройств', 180, 'Зачёт с оценкой', true),
            ('RADIO', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('ENERGY', 1, 1, 'Теплотехнические основы энергетики', 108, 'Экзамен', false),
            ('ENERGY', 1, 2, 'Электромеханические системы', 126, 'Экзамен', true),
            ('ENERGY', 2, 3, 'Энергетические установки', 126, 'Экзамен', true),
            ('ENERGY', 2, 4, 'Автоматизация энергообъектов', 126, 'Экзамен', true),
            ('ENERGY', 3, 5, 'Энергоэффективные технологии', 108, 'Экзамен', false),
            ('ENERGY', 3, 6, 'Надежность энергетических систем', 108, 'Экзамен', false),
            ('ENERGY', 4, 7, 'Проектирование энергетических комплексов', 180, 'Зачёт с оценкой', true),
            ('ENERGY', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('AVIATION', 1, 1, 'Основы аэродинамики', 108, 'Экзамен', false),
            ('AVIATION', 1, 2, 'Конструкция летательных аппаратов', 126, 'Экзамен', true),
            ('AVIATION', 2, 3, 'Динамика полета', 126, 'Экзамен', true),
            ('AVIATION', 2, 4, 'Авиационные двигатели и силовые установки', 126, 'Экзамен', true),
            ('AVIATION', 3, 5, 'Беспилотные авиационные комплексы', 108, 'Экзамен', true),
            ('AVIATION', 3, 6, 'Навигация и управление полетом', 108, 'Экзамен', true),
            ('AVIATION', 4, 7, 'Проектирование авиационных систем', 180, 'Зачёт с оценкой', true),
            ('AVIATION', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('ECON', 1, 1, 'Микроэкономика', 108, 'Экзамен', false),
            ('ECON', 1, 2, 'Макроэкономика', 108, 'Экзамен', false),
            ('ECON', 2, 3, 'Корпоративные финансы', 126, 'Экзамен', true),
            ('ECON', 2, 4, 'Эконометрика', 126, 'Экзамен', true),
            ('ECON', 3, 5, 'Стратегический менеджмент', 108, 'Экзамен', false),
            ('ECON', 3, 6, 'Бизнес-аналитика', 108, 'Экзамен', true),
            ('ECON', 4, 7, 'Проектирование бизнес-процессов', 180, 'Зачёт с оценкой', true),
            ('ECON', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('HUMAN', 1, 1, 'Теория общества и культуры', 108, 'Экзамен', false),
            ('HUMAN', 1, 2, 'Методология гуманитарных исследований', 108, 'Зачёт', false),
            ('HUMAN', 2, 3, 'Социальная аналитика', 126, 'Экзамен', true),
            ('HUMAN', 2, 4, 'Психология коммуникаций', 108, 'Экзамен', false),
            ('HUMAN', 3, 5, 'Управление социальными проектами', 108, 'Экзамен', true),
            ('HUMAN', 3, 6, 'Прикладные гуманитарные исследования', 108, 'Зачёт с оценкой', false),
            ('HUMAN', 4, 7, 'Практика в профильной организации', 180, 'Зачёт с оценкой', false),
            ('HUMAN', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('CYBER', 1, 1, 'Основы информационной безопасности', 108, 'Экзамен', false),
            ('CYBER', 1, 2, 'Криптографические протоколы', 126, 'Экзамен', true),
            ('CYBER', 2, 3, 'Защита сетевой инфраструктуры', 126, 'Экзамен', true),
            ('CYBER', 2, 4, 'Безопасность приложений', 126, 'Экзамен', true),
            ('CYBER', 3, 5, 'Мониторинг и реагирование на инциденты', 108, 'Экзамен', false),
            ('CYBER', 3, 6, 'Безопасность облачных и распределенных систем', 108, 'Экзамен', true),
            ('CYBER', 4, 7, 'Аудит и комплаенс информационной безопасности', 180, 'Зачёт с оценкой', false),
            ('CYBER', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('MED', 1, 1, 'Анатомия и физиология для инженеров', 108, 'Зачёт', false),
            ('MED', 1, 2, 'Биомедицинские сигналы и системы', 126, 'Экзамен', true),
            ('MED', 2, 3, 'Медицинские информационные системы', 126, 'Экзамен', true),
            ('MED', 2, 4, 'Обработка и анализ медицинских данных', 126, 'Экзамен', true),
            ('MED', 3, 5, 'Клиническая инженерия', 108, 'Экзамен', false),
            ('MED', 3, 6, 'Нейротехнологии и биосовместимые системы', 108, 'Экзамен', true),
            ('MED', 4, 7, 'Практика в медицинских организациях', 180, 'Зачёт с оценкой', false),
            ('MED', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('CONSTRUCT', 1, 1, 'Основы строительного материаловедения', 108, 'Экзамен', false),
            ('CONSTRUCT', 1, 2, 'Инженерная графика и BIM', 126, 'Экзамен', true),
            ('CONSTRUCT', 2, 3, 'Сопротивление материалов и конструкции', 126, 'Экзамен', true),
            ('CONSTRUCT', 2, 4, 'Технология строительного производства', 126, 'Экзамен', true),
            ('CONSTRUCT', 3, 5, 'Проектирование зданий и сооружений', 108, 'Экзамен', true),
            ('CONSTRUCT', 3, 6, 'Организация и экономика строительства', 108, 'Экзамен', false),
            ('CONSTRUCT', 4, 7, 'Производственная практика в строительстве', 180, 'Зачёт с оценкой', false),
            ('CONSTRUCT', 4, 8, 'Выпускной проект', 180, 'Зачёт', true),

            ('LINGUA', 1, 1, 'Теория языка и коммуникации', 108, 'Экзамен', false),
            ('LINGUA', 1, 2, 'Практический курс иностранного языка', 126, 'Экзамен', false),
            ('LINGUA', 2, 3, 'Переводческие технологии', 126, 'Экзамен', true),
            ('LINGUA', 2, 4, 'Межкультурная коммуникация', 108, 'Экзамен', false),
            ('LINGUA', 3, 5, 'Лингвистическая экспертиза текста', 108, 'Экзамен', false),
            ('LINGUA', 3, 6, 'Медиа и цифровые коммуникации', 108, 'Экзамен', true),
            ('LINGUA', 4, 7, 'Профессиональная языковая практика', 180, 'Зачёт с оценкой', false),
            ('LINGUA', 4, 8, 'Выпускной проект', 180, 'Зачёт', true)
    ) AS p(profile_track, course, semester, base_title, hours, attestation, course_work)
      ON p.profile_track = dm.profile_track
),
profile_specialist_extra AS (
    SELECT
        dm.direction_id,
        p.course,
        p.semester,
        p.base_title || ' [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']' AS discipline,
        p.hours,
        p.attestation,
        p.course_work
    FROM direction_meta dm
    JOIN (
        VALUES
            ('IT', 5, 9, 'Архитектура высоконагруженных систем', 126, 'Экзамен', true),
            ('IT', 5, 10, 'Инженерный проект', 216, 'Зачёт с оценкой', true),
            ('RADIO', 5, 9, 'Проектирование радиотехнических комплексов', 126, 'Экзамен', true),
            ('RADIO', 5, 10, 'Инженерный проект', 216, 'Зачёт с оценкой', true),
            ('ENERGY', 5, 9, 'Модернизация энергетических систем', 126, 'Экзамен', true),
            ('ENERGY', 5, 10, 'Инженерный проект', 216, 'Зачёт с оценкой', true),
            ('AVIATION', 5, 9, 'Комплексные авиационные системы', 126, 'Экзамен', true),
            ('AVIATION', 5, 10, 'Инженерный проект', 216, 'Зачёт с оценкой', true),
            ('ECON', 5, 9, 'Финансовое моделирование и риск-менеджмент', 126, 'Экзамен', true),
            ('ECON', 5, 10, 'Выпускной аналитический проект', 216, 'Зачёт с оценкой', true),
            ('HUMAN', 5, 9, 'Социальное проектирование', 126, 'Экзамен', true),
            ('HUMAN', 5, 10, 'Выпускной проект', 216, 'Зачёт с оценкой', true),
            ('CYBER', 5, 9, 'Комплексная защита критической инфраструктуры', 126, 'Экзамен', true),
            ('CYBER', 5, 10, 'Инженерный проект', 216, 'Зачёт с оценкой', true),
            ('MED', 5, 9, 'Регуляторика медицинских технологий', 126, 'Экзамен', false),
            ('MED', 5, 10, 'Выпускной инженерный проект', 216, 'Зачёт с оценкой', true),
            ('CONSTRUCT', 5, 9, 'Инфраструктурные проекты полного цикла', 126, 'Экзамен', true),
            ('CONSTRUCT', 5, 10, 'Выпускной инженерный проект', 216, 'Зачёт с оценкой', true),
            ('LINGUA', 5, 9, 'Профессиональный перевод в отрасли', 126, 'Экзамен', true),
            ('LINGUA', 5, 10, 'Выпускной переводческий проект', 216, 'Зачёт с оценкой', true)
    ) AS p(profile_track, course, semester, base_title, hours, attestation, course_work)
      ON p.profile_track = dm.profile_track
),
profile_master AS (
    SELECT
        dm.direction_id,
        p.course,
        p.semester,
        p.base_title || ' [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']' AS discipline,
        p.hours,
        p.attestation,
        p.course_work
    FROM direction_meta dm
    JOIN (
        VALUES
            ('IT', 1, 1, 'Современные архитектуры программных платформ', 108, 'Экзамен', false),
            ('IT', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('IT', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('IT', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('RADIO', 1, 1, 'Современные радиотехнические системы', 108, 'Экзамен', false),
            ('RADIO', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('RADIO', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('RADIO', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('ENERGY', 1, 1, 'Умные энергетические сети', 108, 'Экзамен', false),
            ('ENERGY', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('ENERGY', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('ENERGY', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('AVIATION', 1, 1, 'Интеллектуальные авиационные комплексы', 108, 'Экзамен', false),
            ('AVIATION', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('AVIATION', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('AVIATION', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('ECON', 1, 1, 'Цифровая экономика и аналитика', 108, 'Экзамен', false),
            ('ECON', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('ECON', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('ECON', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('HUMAN', 1, 1, 'Современные гуманитарные исследования', 108, 'Экзамен', false),
            ('HUMAN', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('HUMAN', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('HUMAN', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('CYBER', 1, 1, 'Современная кибербезопасность', 108, 'Экзамен', false),
            ('CYBER', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('CYBER', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('CYBER', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('MED', 1, 1, 'Современные биомедицинские технологии', 108, 'Экзамен', false),
            ('MED', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('MED', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('MED', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('CONSTRUCT', 1, 1, 'Цифровые технологии в строительстве', 108, 'Экзамен', false),
            ('CONSTRUCT', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('CONSTRUCT', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('CONSTRUCT', 2, 4, 'Магистерский проект', 216, 'Зачёт', true),
            ('LINGUA', 1, 1, 'Современные языковые технологии', 108, 'Экзамен', false),
            ('LINGUA', 1, 2, 'Проектный семинар магистранта', 126, 'Зачёт с оценкой', true),
            ('LINGUA', 2, 3, 'Научный семинар по направлению', 108, 'Экзамен', true),
            ('LINGUA', 2, 4, 'Магистерский проект', 216, 'Зачёт', true)
    ) AS p(profile_track, course, semester, base_title, hours, attestation, course_work)
      ON p.profile_track = dm.profile_track
),
templates AS (
    SELECT 'BACHELOR'::varchar AS education_level, false AS is_profile, d.*
    FROM disc_core_bachelor d
    UNION ALL
    SELECT 'SPECIALIST'::varchar AS education_level, false AS is_profile, d.*
    FROM disc_core_bachelor d
    UNION ALL
    SELECT 'SPECIALIST'::varchar AS education_level, false AS is_profile, d.*
    FROM disc_core_specialist_extra d
    UNION ALL
    SELECT 'MASTER'::varchar AS education_level, false AS is_profile, d.*
    FROM disc_core_master d
),
templates_profile AS (
    SELECT 'BACHELOR'::varchar AS education_level, true AS is_profile, p.direction_id, p.course, p.semester, p.discipline, p.hours, p.attestation, p.course_work
    FROM profile_bachelor p
    UNION ALL
    SELECT 'SPECIALIST'::varchar AS education_level, true AS is_profile, p.direction_id, p.course, p.semester, p.discipline, p.hours, p.attestation, p.course_work
    FROM profile_bachelor p
    UNION ALL
    SELECT 'SPECIALIST'::varchar AS education_level, true AS is_profile, p.direction_id, p.course, p.semester, p.discipline, p.hours, p.attestation, p.course_work
    FROM profile_specialist_extra p
    UNION ALL
    SELECT 'MASTER'::varchar AS education_level, true AS is_profile, p.direction_id, p.course, p.semester, p.discipline, p.hours, p.attestation, p.course_work
    FROM profile_master p
),
templates_all AS (
    SELECT
        gv.direction_id,
        dm.direction_name,
        dm.direction_code,
        dm.direction_short_name,
        dm.profile_track,
        gv.education_level,
        gv.education_form,
        gv.accelerated,
        t.is_profile,
        t.course,
        t.semester,
        t.discipline,
        t.hours,
        t.attestation,
        t.course_work
    FROM group_variants gv
    JOIN direction_meta dm ON dm.direction_id = gv.direction_id
    JOIN templates t ON t.education_level = gv.education_level

    UNION ALL

    SELECT
        gv.direction_id,
        dm.direction_name,
        dm.direction_code,
        dm.direction_short_name,
        dm.profile_track,
        gv.education_level,
        gv.education_form,
        gv.accelerated,
        t.is_profile,
        t.course,
        t.semester,
        t.discipline,
        t.hours,
        t.attestation,
        t.course_work
    FROM group_variants gv
    JOIN direction_meta dm ON dm.direction_id = gv.direction_id
    JOIN templates_profile t
      ON t.education_level = gv.education_level
     AND t.direction_id = gv.direction_id
),
plan_versions AS (
    SELECT
        dm.direction_id,
        years.plan_year,
        CASE
            WHEN years.plan_year <= 2023 THEN 'legacy'
            WHEN years.plan_year <= 2026 THEN 'standard'
            ELSE 'modern'
        END AS plan_stage
    FROM direction_meta dm
    JOIN LATERAL (
        SELECT unnest(
            CASE
                WHEN mod(dm.direction_id, 3) = 0 THEN ARRAY[2020, 2024, 2028]::int[]
                WHEN mod(dm.direction_id, 3) = 1 THEN ARRAY[2021, 2025, 2027]::int[]
                ELSE ARRAY[2020, 2023, 2026]::int[]
            END
        ) AS plan_year
        ) AS years ON true
),
plan_signatures AS (
    SELECT
        pv.direction_id,
        pv.plan_year,
        pv.plan_stage,
        mod(abs(hashtext(pv.direction_id::text || ':' || pv.plan_year::text)), 4) AS variant
    FROM plan_versions pv
),
versioned_templates AS (
    SELECT
        ta.direction_id,
        ta.education_level,
        ta.education_form,
        ta.accelerated,
        ta.is_profile,
        ps.plan_year,
        ta.course,
        ta.semester,
        CASE
            WHEN ta.is_profile
                AND ps.plan_stage = 'standard'
                AND ta.education_level IN ('BACHELOR', 'SPECIALIST')
                AND ta.course = 2
                AND ta.semester = 4
                THEN 'Проектирование цифровых решений [' || coalesce(nullif(ta.direction_short_name, ''), ta.direction_code) || ']'
            WHEN ta.is_profile
                AND ps.plan_stage = 'modern'
                AND ta.education_level IN ('BACHELOR', 'SPECIALIST')
                AND ta.course = 3
                AND ta.semester = 6
                THEN 'Интеллектуальные платформы и инженерия данных [' || coalesce(nullif(ta.direction_short_name, ''), ta.direction_code) || ']'
            WHEN ta.is_profile
                AND ps.plan_stage = 'modern'
                AND ta.education_level = 'MASTER'
                AND ta.course = 1
                AND ta.semester = 2
                THEN 'Исследовательский проект и управление продуктом [' || coalesce(nullif(ta.direction_short_name, ''), ta.direction_code) || ']'
            WHEN ta.is_profile
                AND ps.plan_stage = 'modern'
                AND ta.education_level = 'SPECIALIST'
                AND ta.course = 5
                AND ta.semester = 9
                THEN 'Технологический аудит и отраслевой инжиниринг [' || coalesce(nullif(ta.direction_short_name, ''), ta.direction_code) || ']'
            ELSE ta.discipline
        END AS discipline,
        CASE
            WHEN ta.is_profile
                AND ps.plan_stage = 'standard'
                AND ta.education_level IN ('BACHELOR', 'SPECIALIST')
                AND ta.course = 2
                AND ta.semester = 4
                THEN ta.hours + 18
            WHEN ta.is_profile
                AND ps.plan_stage = 'modern'
                AND ta.education_level IN ('BACHELOR', 'SPECIALIST')
                AND ta.course = 3
                AND ta.semester = 6
                THEN ta.hours + 18
            WHEN ta.is_profile
                AND ps.plan_stage = 'modern'
                AND ta.education_level = 'MASTER'
                AND ta.course = 1
                AND ta.semester = 2
                THEN ta.hours + 18
            ELSE ta.hours
        END AS hours,
        CASE
            WHEN ta.is_profile
                AND ps.plan_stage = 'modern'
                AND ta.education_level = 'MASTER'
                AND ta.course = 1
                AND ta.semester = 2
                THEN 'Экзамен'
            ELSE ta.attestation
        END AS attestation,
        CASE
            WHEN ta.is_profile
                AND ps.plan_stage = 'standard'
                AND ta.education_level IN ('BACHELOR', 'SPECIALIST')
                AND ta.course = 2
                AND ta.semester = 4
                THEN true
            ELSE ta.course_work
        END AS course_work
    FROM (
        SELECT
            ta.*,
            row_number() OVER (
                PARTITION BY ta.direction_id, ta.education_level, ta.education_form, ta.accelerated, ta.course, ta.semester, ta.is_profile
                ORDER BY ta.discipline
            ) AS slot
        FROM templates_all ta
    ) ta
    JOIN plan_signatures ps ON ps.direction_id = ta.direction_id
    WHERE NOT (
            ps.variant = 1
            AND ta.is_profile
            AND ta.slot = 1
            AND ta.course = 1
            AND ta.semester IN (1, 2)
        )
      AND NOT (
            ps.variant = 2
            AND NOT ta.is_profile
            AND ta.slot = 1
            AND ta.course = 2
            AND ta.semester = 3
        )
      AND NOT (
            ps.variant = 3
            AND NOT ta.is_profile
            AND ta.slot = 2
            AND ta.course = 4
            AND ta.semester = 7
        )
),
year_additions_base AS (
    SELECT
        gv.direction_id,
        gv.education_level,
        gv.education_form,
        gv.accelerated,
        false AS is_profile,
        ps.plan_year,
        CASE WHEN gv.education_level = 'MASTER' THEN 2 ELSE 3 END AS course,
        CASE WHEN gv.education_level = 'MASTER' THEN 3 ELSE 5 END AS semester,
        CASE
            WHEN ps.plan_stage = 'standard'
                THEN 'Междисциплинарный проект [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']'
            ELSE 'Проект цифровой трансформации [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']'
        END AS discipline,
        CASE WHEN gv.education_level = 'MASTER' THEN 72 ELSE 90 END AS hours,
        'Зачёт с оценкой' AS attestation,
        true AS course_work
    FROM group_variants gv
    JOIN direction_meta dm ON dm.direction_id = gv.direction_id
    JOIN plan_signatures ps ON ps.direction_id = gv.direction_id
    WHERE ps.plan_stage IN ('standard', 'modern')
      AND (
            (gv.education_level IN ('BACHELOR', 'SPECIALIST'))
            OR (gv.education_level = 'MASTER' AND gv.accelerated = false)
      )
),
year_additions_extra AS (
    SELECT
        gv.direction_id,
        gv.education_level,
        gv.education_form,
        gv.accelerated,
        false AS is_profile,
        ps.plan_year,
        CASE
            WHEN gv.education_level = 'MASTER' THEN 1
            WHEN ps.variant = 0 THEN 1
            ELSE 2
        END AS course,
        CASE
            WHEN gv.education_level = 'MASTER' THEN 2
            WHEN ps.variant = 0 THEN 2
            ELSE 4
        END AS semester,
        CASE
            WHEN gv.education_level = 'MASTER'
                THEN 'Специализированный исследовательский модуль [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']'
            WHEN ps.variant = 0
                THEN 'Универсальный цифровой модуль [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']'
            ELSE 'Практико-ориентированный модуль [' || coalesce(nullif(dm.direction_short_name, ''), dm.direction_code) || ']'
        END AS discipline,
        CASE
            WHEN gv.education_level = 'MASTER' THEN 72
            WHEN ps.variant = 0 THEN 54
            ELSE 72
        END AS hours,
        CASE
            WHEN gv.education_level = 'MASTER' THEN 'Зачёт с оценкой'
            WHEN ps.variant = 0 THEN 'Зачёт'
            ELSE 'Экзамен'
        END AS attestation,
        CASE
            WHEN gv.education_level = 'MASTER' THEN true
            ELSE ps.variant = 2
        END AS course_work
    FROM group_variants gv
    JOIN direction_meta dm ON dm.direction_id = gv.direction_id
    JOIN plan_signatures ps ON ps.direction_id = gv.direction_id
    WHERE ps.plan_stage IN ('standard', 'modern')
      AND ps.variant IN (0, 2, 3)
      AND (
            (gv.education_level IN ('BACHELOR', 'SPECIALIST') AND ps.variant IN (0, 2))
            OR (gv.education_level = 'MASTER' AND gv.accelerated = false)
      )
),
year_additions AS (
    SELECT * FROM year_additions_base
    UNION ALL
    SELECT * FROM year_additions_extra
),
all_versioned AS (
    SELECT * FROM versioned_templates
    UNION ALL
    SELECT * FROM year_additions
)
INSERT INTO curriculums (
    course,
    semester,
    discipline,
    hours,
    attestation,
    course_work,
    direction_id,
    education_level,
    education_form,
    accelerated,
    plan_year
)
SELECT
    t.course,
    t.semester,
    t.discipline,
    t.hours,
    t.attestation,
    t.course_work,
    t.direction_id,
    t.education_level,
    t.education_form,
    t.accelerated,
    t.plan_year
FROM all_versioned t
WHERE (
    t.education_level = 'BACHELOR'
    AND (
        t.accelerated = false
        OR t.semester <= 6
    )
) OR (
    t.education_level = 'SPECIALIST'
    AND (
        t.accelerated = false
        OR t.semester <= 8
    )
) OR (
    t.education_level = 'MASTER'
    AND (
        t.accelerated = false
        OR t.semester <= 2
    )
);

-- Нормализация названий дисциплин без суффикса "по профилю ..."
UPDATE curriculums
SET discipline = trim(regexp_replace(discipline, E'\\s+по профилю\\s+\"[^\"]+\"\\s*$', '', 'g'))
WHERE discipline ~ E'\\s+по профилю\\s+\"[^\"]+\"\\s*$';

UPDATE curriculums
SET discipline = 'Практика образовательной программы'
WHERE discipline = 'Практика по профилю программы';

ALTER TABLE curriculums
    ADD CONSTRAINT uq_curriculum_plan_scope
        UNIQUE (course, semester, discipline, direction_id, education_level, education_form, accelerated, plan_year);

-- =========================================================
-- 5) Студенты: 20-30 человек в каждой группе
-- =========================================================
WITH const AS (
    SELECT
        ARRAY[
            'Иванов','Петров','Сидоров','Смирнов','Кузнецов','Попов','Соколов','Лебедев','Козлов','Новиков',
            'Морозов','Волков','Алексеев','Фёдоров','Михайлов','Павлов','Семёнов','Громов','Орлов','Беляев',
            'Захаров','Крылов','Макаров','Титов'
        ]::text[] AS male_last,
        ARRAY[
            'Иванова','Петрова','Сидорова','Смирнова','Кузнецова','Попова','Соколова','Лебедева','Козлова','Новикова',
            'Морозова','Волкова','Алексеева','Фёдорова','Михайлова','Павлова','Семёнова','Громова','Орлова','Беляева',
            'Захарова','Крылова','Макарова','Титова'
        ]::text[] AS female_last,
        ARRAY[
            'Александр','Дмитрий','Максим','Артём','Кирилл','Илья','Никита','Матвей','Егор','Тимофей',
            'Роман','Андрей','Данил','Олег','Павел','Владислав','Михаил','Сергей','Денис','Арсений'
        ]::text[] AS male_first,
        ARRAY[
            'Анна','Мария','Елизавета','София','Виктория','Дарья','Полина','Екатерина','Алина','Ксения',
            'Ирина','Ольга','Татьяна','Вероника','Арина','Валерия','Юлия','Марина','Светлана','Надежда'
        ]::text[] AS female_first,
        ARRAY[
            'Александрович','Дмитриевич','Максимович','Артёмович','Кириллович','Ильич','Никитич','Матвеевич','Егорович','Тимофеевич',
            'Романович','Андреевич','Данилович','Олегович','Павлович','Владиславович','Михайлович','Сергеевич','Денисович','Арсеньевич'
        ]::text[] AS male_middle,
        ARRAY[
            'Александровна','Дмитриевна','Максимовна','Артёмовна','Кирилловна','Ильинична','Никитична','Матвеевна','Егоровна','Тимофеевна',
            'Романовна','Андреевна','Даниловна','Олеговна','Павловна','Владиславовна','Михайловна','Сергеевна','Денисовна','Арсеньевна'
        ]::text[] AS female_middle
),
group_base AS (
    SELECT
        g.id AS group_id,
        g.code AS group_code,
        g.course AS course,
        coalesce(g.education_level, 'BACHELOR') AS education_level,
        coalesce(g.education_form, 'FULL_TIME') AS group_education_form,
        coalesce(g.accelerated, false) AS accelerated,
        make_date(2027 - g.course, 9, 1) AS study_start_date
    FROM student_groups g
),
generated AS (
    SELECT
        gb.group_id,
        gb.group_code,
        gb.course,
        gb.education_level,
        gb.group_education_form,
        gb.accelerated,
        gb.study_start_date,
        seq.n,
        row_number() OVER (ORDER BY gb.group_id, seq.n) AS rn,
        ((hashtext(gb.group_code || ':' || seq.n::text)::bigint & 2147483647) % 2 = 0) AS is_male
    FROM group_base gb
    CROSS JOIN LATERAL generate_series(
        1,
        CASE gb.course
            WHEN 1 THEN 1
            WHEN 2 THEN 1
            WHEN 3 THEN 2
            WHEN 4 THEN 2
            ELSE 5
        END
    ) AS seq(n)
),
named AS (
    SELECT
        g.group_id,
        g.course,
        g.education_level,
        g.group_education_form,
        g.accelerated,
        g.study_start_date,
        g.rn,
        CASE
            WHEN g.is_male THEN c.male_last[((hashtext('ml:' || g.rn::text)::bigint & 2147483647) % array_length(c.male_last, 1)) + 1]
            ELSE c.female_last[((hashtext('fl:' || g.rn::text)::bigint & 2147483647) % array_length(c.female_last, 1)) + 1]
        END AS last_name,
        CASE
            WHEN g.is_male THEN c.male_first[((hashtext('mf:' || g.rn::text)::bigint & 2147483647) % array_length(c.male_first, 1)) + 1]
            ELSE c.female_first[((hashtext('ff:' || g.rn::text)::bigint & 2147483647) % array_length(c.female_first, 1)) + 1]
        END AS first_name,
        CASE
            WHEN g.is_male THEN c.male_middle[((hashtext('mm:' || g.rn::text)::bigint & 2147483647) % array_length(c.male_middle, 1)) + 1]
            ELSE c.female_middle[((hashtext('fm:' || g.rn::text)::bigint & 2147483647) % array_length(c.female_middle, 1)) + 1]
        END AS middle_name
    FROM generated g
    CROSS JOIN const c
),
numbered AS (
    SELECT
        n.*,
        row_number() OVER (
            PARTITION BY extract(year FROM n.study_start_date)
            ORDER BY n.rn
        ) AS seq_in_study_year
    FROM named n
)
INSERT INTO students (
    last_name,
    first_name,
    middle_name,
    record_book,
    course,
    status,
    birth_date,
    phone,
    email,
    group_id,
    education_form,
    education_base,
    study_contract_number,
    study_start_date
)
SELECT
    n.last_name,
    n.first_name,
    n.middle_name,
    to_char(n.study_start_date, 'YY') || '/' || lpad(n.seq_in_study_year::text, 3, '0') AS record_book,
    n.course,
    'ACTIVE'::varchar AS status,
    make_date(
        extract(year FROM n.study_start_date)::int
        - CASE
            WHEN n.education_level = 'MASTER' THEN 21
            ELSE 17
        END
        - ((hashtext('y:' || n.rn::text)::bigint & 2147483647) % 2)::int,
        1 + ((hashtext('m:' || n.rn::text)::bigint & 2147483647) % 12)::int,
        1 + ((hashtext('d:' || n.rn::text)::bigint & 2147483647) % 27)::int
    ) AS birth_date,
    '+79' || lpad((100000000 + n.rn)::text, 9, '0') AS phone,
    'student' || n.rn::text || '@piaps.local' AS email,
    n.group_id,
    CASE
        WHEN n.group_education_form = 'PART_TIME' THEN 'Очно-заочная'
        WHEN n.group_education_form = 'DISTANCE' THEN 'Заочная'
        ELSE 'Очная'
    END AS education_form,
    CASE
        WHEN n.group_education_form IN ('PART_TIME', 'DISTANCE')
             AND ((hashtext('edu_base:' || n.rn::text)::bigint & 2147483647) % 10) < 6 THEN 'Внебюджет'
        WHEN n.group_education_form = 'FULL_TIME'
             AND ((hashtext('edu_base:' || n.rn::text)::bigint & 2147483647) % 10) < 3 THEN 'Внебюджет'
        ELSE 'Бюджет'
    END AS education_base,
    to_char(n.study_start_date, 'YYYY') || '-З-' || lpad(n.seq_in_study_year::text, 3, '0') AS study_contract_number,
    n.study_start_date AS study_start_date
FROM numbered n;

-- =========================================================
-- 6) Статусы студентов
--    Около 50 отчисленных + академ + выпускники
-- =========================================================

-- 10 групп с академом (по 8 чел в группе) для корректных приказов
WITH acad_groups AS (
    SELECT id
    FROM student_groups
    WHERE course IN (2, 3)
    ORDER BY id
    LIMIT 10
),
acad_students AS (
    SELECT s.id
    FROM acad_groups g
    JOIN LATERAL (
        SELECT s.id
        FROM students s
        WHERE s.group_id = g.id
          AND s.status = 'ACTIVE'
        ORDER BY s.id
        LIMIT 8
    ) s ON true
)
UPDATE students
SET status = 'ACADEMIC_LEAVE'
WHERE id IN (SELECT id FROM acad_students);

-- Дополнительно академический отпуск для реалистичной выборки
WITH extra_acad AS (
    SELECT id
    FROM students
    WHERE status = 'ACTIVE'
      AND course IN (2, 3, 4)
    ORDER BY (hashtext(id::text || ':acad')::bigint & 2147483647), id
    LIMIT 180
)
UPDATE students
SET status = 'ACADEMIC_LEAVE'
WHERE id IN (SELECT id FROM extra_acad);

-- Ровно 50 отчисленных
WITH expel_candidates AS (
    SELECT id
    FROM students
    WHERE status = 'ACTIVE'
      AND course IN (2, 3, 4)
    ORDER BY group_id, id
    LIMIT 50
)
UPDATE students
SET status = 'EXPELLED'
WHERE id IN (SELECT id FROM expel_candidates);

-- Выпускники (финальные курсы по уровню и форме ускорения)
WITH grad_candidates AS (
    SELECT s.id
    FROM students s
    JOIN student_groups g ON g.id = s.group_id
    WHERE s.status = 'ACTIVE'
      AND (
            (
                coalesce(g.education_level, 'BACHELOR') = 'BACHELOR'
                AND s.course = CASE WHEN coalesce(g.accelerated, false) THEN 3 ELSE 4 END
            )
            OR (
                coalesce(g.education_level, 'BACHELOR') = 'MASTER'
                AND s.course = CASE WHEN coalesce(g.accelerated, false) THEN 1 ELSE 2 END
            )
            OR (
                coalesce(g.education_level, 'BACHELOR') = 'SPECIALIST'
                AND s.course = CASE WHEN coalesce(g.accelerated, false) THEN 4 ELSE 5 END
            )
        )
    ORDER BY s.id
    LIMIT 500
)
UPDATE students
SET status = 'GRADUATED'
WHERE id IN (SELECT id FROM grad_candidates);

-- =========================================================
-- 7) Приказы 2026 года: 25 штук
--    5 ENROLLMENT, 5 ACADEMIC_LEAVE, 5 EXPULSION,
--    5 TRANSFER_NEXT_COURSE, 5 TRANSFER_DIRECTION
-- =========================================================

-- ---------------------------------------------------------
-- 7.1 ENROLLMENT (5)
-- ---------------------------------------------------------
WITH plans AS (
    SELECT
        row_number() OVER (ORDER BY f.id) AS ord,
        f.id AS faculty_id,
        f.name AS faculty_name,
        g.id AS group_id,
        g.code AS group_code,
        d.name AS direction_name
    FROM faculties f
    JOIN LATERAL (
        SELECT g.id, g.code, g.direction_id
        FROM student_groups g
        JOIN directions d0 ON d0.id = g.direction_id
        WHERE d0.faculty_id = f.id
          AND g.course = 1
        ORDER BY d0.id, g.id
        LIMIT 1
    ) g ON true
    JOIN directions d ON d.id = g.direction_id
),
students_in_plan AS (
    SELECT
        p.ord,
        p.faculty_name,
        p.group_id,
        p.group_code,
        p.direction_name,
        CASE WHEN p.ord % 2 = 0 THEN 'Внебюджет' ELSE 'Бюджет' END AS education_base,
        CASE
            WHEN p.ord % 2 = 0 THEN 'договор об оказании платных образовательных услуг №' || (1000 + p.ord)::text || '/26'
            ELSE ''
        END AS contract_info,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.group_id
     AND s.course = 1
     AND s.status = 'ACTIVE'
),
payload AS (
    SELECT
        ord,
        min(faculty_name) AS faculty_name,
        min(group_code) AS group_code,
        min(direction_name) AS direction_name,
        min(education_base) AS education_base,
        min(contract_info) AS contract_info,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'протокол приёмной комиссии от 30.08.2026',
                'toCourse', 1,
                'facultyName', faculty_name,
                'toGroup', group_code,
                'toDirection', direction_name,
                'educationForm', 'Очная',
                'educationBase', education_base,
                'specialityName', direction_name,
                'contractInfo', contract_info
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    students_list,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    group_code,
    education_form,
    education_base,
    cost_info,
    contract_info
)
SELECT
    '2026-ENR-' || lpad(ord::text, 2, '0') AS number,
    DATE '2026-09-01' AS order_date,
    'ENROLLMENT' AS type,
    'На основании решения приёмной комиссии зачислить на 1 курс.' AS text,
    DATE '2026-09-01' AS sign_date,
    'Ответственный секретарь приёмной комиссии' AS signer_position,
    'К.А. Мельникова' AS signer_name,
    NULL AS students_list,
    student_ids,
    student_items_json,
    'протокол приёмной комиссии от 30.08.2026' AS basis,
    direction_name,
    group_code,
    'Очная' AS education_form,
    education_base,
    CASE WHEN education_base = 'Внебюджет' THEN '155000 руб./год' ELSE NULL END AS cost_info,
    NULLIF(contract_info, '') AS contract_info
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 7.2 TRANSFER_NEXT_COURSE (5)
-- ---------------------------------------------------------
WITH candidates AS (
    SELECT
        g.id AS source_group_id,
        g.code AS source_group_code,
        g.course AS from_course,
        d.name AS direction_name,
        f.name AS faculty_name,
        tg.id AS target_group_id,
        tg.code AS target_group_code,
        row_number() OVER (ORDER BY f.id, d.id, g.id) AS ord
    FROM student_groups g
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    JOIN LATERAL (
        SELECT g2.id, g2.code
        FROM student_groups g2
        WHERE g2.direction_id = g.direction_id
          AND g2.course = g.course + 1
        ORDER BY g2.id
        LIMIT 1
    ) tg ON true
    WHERE g.course = 2
      AND (SELECT count(*) FROM students s WHERE s.group_id = g.id AND s.status = 'ACTIVE') >= 20
),
plans AS (
    SELECT *
    FROM candidates
    WHERE ord <= 5
),
students_in_plan AS (
    SELECT
        p.ord,
        p.source_group_code,
        p.target_group_code,
        p.from_course,
        p.from_course + 1 AS to_course,
        p.direction_name,
        p.faculty_name,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.source_group_id
     AND s.status = 'ACTIVE'
),
payload AS (
    SELECT
        ord,
        min(source_group_code) AS source_group_code,
        min(target_group_code) AS target_group_code,
        min(from_course) AS from_course,
        min(to_course) AS to_course,
        min(direction_name) AS direction_name,
        min(faculty_name) AS faculty_name,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'результаты промежуточной аттестации за 2025/2026 учебный год',
                'fromCourse', from_course,
                'toCourse', to_course,
                'facultyName', faculty_name,
                'fromGroup', source_group_code,
                'toGroup', target_group_code,
                'fromDirection', direction_name,
                'toDirection', direction_name
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    old_direction,
    old_group,
    new_direction,
    new_group,
    previous_course,
    next_course
)
SELECT
    '2026-TNC-' || lpad(ord::text, 2, '0') AS number,
    DATE '2026-06-25' AS order_date,
    'TRANSFER_NEXT_COURSE' AS type,
    'Перевести студентов на следующий курс по итогам учебного года.' AS text,
    DATE '2026-06-26' AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    student_ids,
    student_items_json,
    'результаты промежуточной аттестации' AS basis,
    direction_name,
    direction_name AS old_direction,
    source_group_code AS old_group,
    direction_name AS new_direction,
    target_group_code AS new_group,
    from_course AS previous_course,
    to_course AS next_course
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 7.3 TRANSFER_DIRECTION (5)
-- ---------------------------------------------------------
WITH dir_map AS (
    SELECT
        d.id AS source_direction_id,
        d.name AS source_direction_name,
        d.faculty_id,
        coalesce(
            lead(d.id) OVER (PARTITION BY d.faculty_id ORDER BY d.id),
            first_value(d.id) OVER (PARTITION BY d.faculty_id ORDER BY d.id)
        ) AS target_direction_id
    FROM directions d
),
candidates AS (
    SELECT
        g.id AS source_group_id,
        g.code AS source_group_code,
        g.course AS course,
        dm.source_direction_name,
        td.name AS target_direction_name,
        f.name AS faculty_name,
        tg.id AS target_group_id,
        tg.code AS target_group_code,
        row_number() OVER (ORDER BY f.id, g.id) AS ord
    FROM student_groups g
    JOIN dir_map dm ON dm.source_direction_id = g.direction_id
    JOIN faculties f ON f.id = dm.faculty_id
    JOIN directions td ON td.id = dm.target_direction_id
    JOIN LATERAL (
        SELECT g2.id, g2.code
        FROM student_groups g2
        WHERE g2.direction_id = dm.target_direction_id
          AND g2.course = g.course
        ORDER BY g2.id
        LIMIT 1
    ) tg ON true
    WHERE g.course = 3
      AND dm.target_direction_id <> g.direction_id
      AND (SELECT count(*) FROM students s WHERE s.group_id = g.id AND s.status = 'ACTIVE') >= 12
),
plans AS (
    SELECT *
    FROM candidates
    WHERE ord <= 5
),
students_ranked AS (
    SELECT
        p.ord,
        p.source_group_code,
        p.target_group_code,
        p.course,
        p.source_direction_name,
        p.target_direction_name,
        p.faculty_name,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.source_group_id
     AND s.status = 'ACTIVE'
),
students_in_plan AS (
    SELECT *
    FROM students_ranked
    WHERE rn <= 22
),
payload AS (
    SELECT
        ord,
        min(source_group_code) AS source_group_code,
        min(target_group_code) AS target_group_code,
        min(course) AS course,
        min(source_direction_name) AS source_direction_name,
        min(target_direction_name) AS target_direction_name,
        min(faculty_name) AS faculty_name,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'личное заявление студента и согласование деканатов',
                'fromCourse', course,
                'toCourse', course,
                'facultyName', faculty_name,
                'fromGroup', source_group_code,
                'toGroup', target_group_code,
                'fromDirection', source_direction_name,
                'toDirection', target_direction_name
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    old_direction,
    old_group,
    new_direction,
    new_group,
    previous_course,
    next_course
)
SELECT
    '2026-TDR-' || lpad(ord::text, 2, '0') AS number,
    CASE WHEN ord <= 3 THEN DATE '2026-01-25' ELSE DATE '2026-06-25' END AS order_date,
    'TRANSFER_DIRECTION' AS type,
    'Перевести студентов на другое направление подготовки по личным заявлениям.' AS text,
    CASE WHEN ord <= 3 THEN DATE '2026-01-26' ELSE DATE '2026-06-26' END AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    student_ids,
    student_items_json,
    'личное заявление студента' AS basis,
    target_direction_name AS direction_name,
    source_direction_name AS old_direction,
    source_group_code AS old_group,
    target_direction_name AS new_direction,
    target_group_code AS new_group,
    course AS previous_course,
    course AS next_course
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 7.4 ACADEMIC_LEAVE (5)
-- ---------------------------------------------------------
WITH candidates AS (
    SELECT
        g.id AS group_id,
        g.code AS group_code,
        g.course,
        d.name AS direction_name,
        f.name AS faculty_name,
        count(*) AS cnt,
        row_number() OVER (ORDER BY count(*) DESC, g.id) AS ord
    FROM students s
    JOIN student_groups g ON g.id = s.group_id
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE s.status = 'ACADEMIC_LEAVE'
    GROUP BY g.id, g.code, g.course, d.name, f.name
    HAVING count(*) >= 5
),
plans AS (
    SELECT *
    FROM candidates
    WHERE ord <= 5
),
students_ranked AS (
    SELECT
        p.ord,
        p.group_code,
        p.course,
        p.direction_name,
        p.faculty_name,
        CASE WHEN p.ord <= 3 THEN DATE '2026-01-26' ELSE DATE '2026-06-26' END AS period_start,
        CASE WHEN p.ord <= 3 THEN DATE '2026-07-25' ELSE DATE '2026-12-23' END AS period_end,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.group_id
     AND s.status = 'ACADEMIC_LEAVE'
),
students_in_plan AS (
    SELECT *
    FROM students_ranked
    WHERE rn <= 8
),
payload AS (
    SELECT
        ord,
        min(group_code) AS group_code,
        min(course) AS course,
        min(direction_name) AS direction_name,
        min(faculty_name) AS faculty_name,
        min(period_start) AS period_start,
        min(period_end) AS period_end,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'медицинское заключение и личное заявление студента',
                'fromCourse', course,
                'facultyName', faculty_name,
                'fromGroup', group_code,
                'fromDirection', direction_name,
                'educationForm', 'Очная',
                'educationBase', 'Бюджет',
                'periodStart', period_start,
                'periodEnd', period_end
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    period_start,
    period_end,
    basis,
    direction_name,
    group_code,
    education_form,
    education_base
)
SELECT
    '2026-ACL-' || lpad(ord::text, 2, '0') AS number,
    CASE WHEN ord <= 3 THEN DATE '2026-01-25' ELSE DATE '2026-06-25' END AS order_date,
    'ACADEMIC_LEAVE' AS type,
    'Предоставить академический отпуск студентам на основании подтверждающих документов.' AS text,
    CASE WHEN ord <= 3 THEN DATE '2026-01-26' ELSE DATE '2026-06-26' END AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    student_ids,
    student_items_json,
    period_start,
    period_end,
    'медицинское заключение и личное заявление' AS basis,
    direction_name,
    group_code,
    'Очная' AS education_form,
    'Бюджет' AS education_base
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 7.5 EXPULSION (5)
-- ---------------------------------------------------------
WITH expelled AS (
    SELECT
        s.id AS student_id,
        s.course,
        g.code AS group_code,
        d.name AS direction_name,
        f.name AS faculty_name,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (ORDER BY s.id) AS rn_all
    FROM students s
    JOIN student_groups g ON g.id = s.group_id
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE s.status = 'EXPELLED'
),
expelled_2026 AS (
    SELECT
        student_id,
        course,
        group_code,
        direction_name,
        faculty_name,
        student_name,
        row_number() OVER (ORDER BY rn_all) AS rn_year
    FROM expelled
    WHERE rn_all > 25
),
ranked AS (
    SELECT
        ntile(5) OVER (ORDER BY rn_year) AS ord,
        student_id,
        course,
        group_code,
        direction_name,
        faculty_name,
        student_name,
        rn_year
    FROM expelled_2026
),
batched AS (
    SELECT
        ord,
        student_id,
        course,
        group_code,
        direction_name,
        faculty_name,
        student_name,
        row_number() OVER (PARTITION BY ord ORDER BY rn_year) AS local_rn
    FROM ranked
),
payload AS (
    SELECT
        ord,
        string_agg(student_id::text, ',' ORDER BY local_rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'личное заявление студента об отчислении',
                'fromCourse', course,
                'facultyName', faculty_name,
                'fromGroup', group_code,
                'fromDirection', direction_name,
                'contractInfo', 'академическая справка выдать по запросу'
            ) ORDER BY local_rn
        )::text AS student_items_json
    FROM batched
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    basis,
    expel_date,
    contract_info
)
SELECT
    '2026-EXP-' || lpad(ord::text, 2, '0') AS number,
    CASE WHEN ord <= 3 THEN DATE '2026-01-25' ELSE DATE '2026-06-25' END AS order_date,
    'EXPULSION' AS type,
    'Отчислить студентов по собственному желанию в конце семестра.' AS text,
    CASE WHEN ord <= 3 THEN DATE '2026-01-26' ELSE DATE '2026-06-26' END AS sign_date,
    'Ректор' AS signer_position,
    'С.В. Ершов' AS signer_name,
    student_ids,
    student_items_json,
    'личное заявление студента' AS basis,
    CASE WHEN ord <= 3 THEN DATE '2026-01-25' ELSE DATE '2026-06-25' END AS expel_date,
    'академическая справка выдать по запросу' AS contract_info
FROM payload
ORDER BY ord;

-- =========================================================
-- 8) Приказы 2025 года: 25 штук
--    5 ENROLLMENT, 5 ACADEMIC_LEAVE, 5 EXPULSION,
--    5 TRANSFER_NEXT_COURSE, 5 TRANSFER_DIRECTION
-- =========================================================

-- ---------------------------------------------------------
-- 8.1 ENROLLMENT (5)
-- ---------------------------------------------------------
WITH plans AS (
    SELECT
        row_number() OVER (ORDER BY f.id) AS ord,
        f.id AS faculty_id,
        f.name AS faculty_name,
        g.id AS group_id,
        g.code AS group_code,
        d.name AS direction_name
    FROM faculties f
    JOIN LATERAL (
        SELECT g.id, g.code, g.direction_id
        FROM student_groups g
        JOIN directions d0 ON d0.id = g.direction_id
        WHERE d0.faculty_id = f.id
          AND g.course = 2
        ORDER BY d0.id, g.id
        LIMIT 1
    ) g ON true
    JOIN directions d ON d.id = g.direction_id
),
students_in_plan AS (
    SELECT
        p.ord,
        p.faculty_name,
        p.group_id,
        p.group_code,
        p.direction_name,
        CASE WHEN p.ord % 2 = 0 THEN 'Внебюджет' ELSE 'Бюджет' END AS education_base,
        CASE
            WHEN p.ord % 2 = 0 THEN 'договор об оказании платных образовательных услуг №' || (1000 + p.ord)::text || '/25'
            ELSE ''
        END AS contract_info,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.group_id
     AND s.study_start_date = DATE '2025-09-01'
),
payload AS (
    SELECT
        ord,
        min(faculty_name) AS faculty_name,
        min(group_code) AS group_code,
        min(direction_name) AS direction_name,
        min(education_base) AS education_base,
        min(contract_info) AS contract_info,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'протокол приёмной комиссии от 30.08.2025',
                'toCourse', 1,
                'facultyName', faculty_name,
                'toGroup', regexp_replace(group_code, '-2([1-3])$', '-1\\1'),
                'toDirection', direction_name,
                'educationForm', 'Очная',
                'educationBase', education_base,
                'specialityName', direction_name,
                'contractInfo', contract_info
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    students_list,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    group_code,
    education_form,
    education_base,
    cost_info,
    contract_info
)
SELECT
    '2025-ENR-' || lpad(ord::text, 2, '0') AS number,
    DATE '2025-09-01' AS order_date,
    'ENROLLMENT' AS type,
    'На основании решения приёмной комиссии зачислить на 1 курс.' AS text,
    DATE '2025-09-01' AS sign_date,
    'Ответственный секретарь приёмной комиссии' AS signer_position,
    'К.А. Мельникова' AS signer_name,
    NULL AS students_list,
    student_ids,
    student_items_json,
    'протокол приёмной комиссии от 30.08.2025' AS basis,
    direction_name,
    regexp_replace(group_code, '-2([1-3])$', '-1\\1') AS group_code,
    'Очная' AS education_form,
    education_base,
    CASE WHEN education_base = 'Внебюджет' THEN '150000 руб./год' ELSE NULL END AS cost_info,
    NULLIF(contract_info, '') AS contract_info
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 8.2 TRANSFER_NEXT_COURSE (5)
-- ---------------------------------------------------------
WITH candidates AS (
    SELECT
        g.id AS source_group_id,
        g.code AS source_group_code,
        g.course AS from_course,
        d.name AS direction_name,
        f.name AS faculty_name,
        tg.id AS target_group_id,
        tg.code AS target_group_code,
        row_number() OVER (ORDER BY f.id, d.id, g.id) AS ord
    FROM student_groups g
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    JOIN LATERAL (
        SELECT g2.id, g2.code
        FROM student_groups g2
        WHERE g2.direction_id = g.direction_id
          AND g2.course = g.course + 1
        ORDER BY g2.id
        LIMIT 1
    ) tg ON true
    WHERE g.course = 3
      AND (SELECT count(*) FROM students s WHERE s.group_id = g.id AND s.status = 'ACTIVE') >= 20
),
plans AS (
    SELECT *
    FROM candidates
    WHERE ord <= 5
),
students_in_plan AS (
    SELECT
        p.ord,
        p.source_group_code,
        p.target_group_code,
        p.from_course,
        p.from_course + 1 AS to_course,
        p.direction_name,
        p.faculty_name,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.source_group_id
     AND s.status = 'ACTIVE'
),
payload AS (
    SELECT
        ord,
        min(source_group_code) AS source_group_code,
        min(target_group_code) AS target_group_code,
        min(from_course) AS from_course,
        min(to_course) AS to_course,
        min(direction_name) AS direction_name,
        min(faculty_name) AS faculty_name,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'результаты промежуточной аттестации за 2024/2025 учебный год',
                'fromCourse', from_course,
                'toCourse', to_course,
                'facultyName', faculty_name,
                'fromGroup', source_group_code,
                'toGroup', target_group_code,
                'fromDirection', direction_name,
                'toDirection', direction_name
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    old_direction,
    old_group,
    new_direction,
    new_group,
    previous_course,
    next_course
)
SELECT
    '2025-TNC-' || lpad(ord::text, 2, '0') AS number,
    DATE '2025-06-25' AS order_date,
    'TRANSFER_NEXT_COURSE' AS type,
    'Перевести студентов на следующий курс по итогам учебного года.' AS text,
    DATE '2025-06-26' AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    student_ids,
    student_items_json,
    'результаты промежуточной аттестации' AS basis,
    direction_name,
    direction_name AS old_direction,
    source_group_code AS old_group,
    direction_name AS new_direction,
    target_group_code AS new_group,
    from_course AS previous_course,
    to_course AS next_course
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 8.3 TRANSFER_DIRECTION (5)
-- ---------------------------------------------------------
WITH dir_map AS (
    SELECT
        d.id AS source_direction_id,
        d.name AS source_direction_name,
        d.faculty_id,
        coalesce(
            lead(d.id) OVER (PARTITION BY d.faculty_id ORDER BY d.id),
            first_value(d.id) OVER (PARTITION BY d.faculty_id ORDER BY d.id)
        ) AS target_direction_id
    FROM directions d
),
candidates AS (
    SELECT
        g.id AS source_group_id,
        g.code AS source_group_code,
        g.course AS course,
        dm.source_direction_name,
        td.name AS target_direction_name,
        f.name AS faculty_name,
        tg.id AS target_group_id,
        tg.code AS target_group_code,
        row_number() OVER (ORDER BY f.id, g.id) AS ord
    FROM student_groups g
    JOIN dir_map dm ON dm.source_direction_id = g.direction_id
    JOIN faculties f ON f.id = dm.faculty_id
    JOIN directions td ON td.id = dm.target_direction_id
    JOIN LATERAL (
        SELECT g2.id, g2.code
        FROM student_groups g2
        WHERE g2.direction_id = dm.target_direction_id
          AND g2.course = g.course
        ORDER BY g2.id
        LIMIT 1
    ) tg ON true
    WHERE g.course = 2
      AND dm.target_direction_id <> g.direction_id
      AND (SELECT count(*) FROM students s WHERE s.group_id = g.id AND s.status = 'ACTIVE') >= 12
),
plans AS (
    SELECT *
    FROM candidates
    WHERE ord <= 5
),
students_ranked AS (
    SELECT
        p.ord,
        p.source_group_code,
        p.target_group_code,
        p.course,
        p.source_direction_name,
        p.target_direction_name,
        p.faculty_name,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.source_group_id
     AND s.status = 'ACTIVE'
),
students_in_plan AS (
    SELECT *
    FROM students_ranked
    WHERE rn <= 20
),
payload AS (
    SELECT
        ord,
        min(source_group_code) AS source_group_code,
        min(target_group_code) AS target_group_code,
        min(course) AS course,
        min(source_direction_name) AS source_direction_name,
        min(target_direction_name) AS target_direction_name,
        min(faculty_name) AS faculty_name,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'личное заявление студента и согласование деканатов',
                'fromCourse', course,
                'toCourse', course,
                'facultyName', faculty_name,
                'fromGroup', source_group_code,
                'toGroup', target_group_code,
                'fromDirection', source_direction_name,
                'toDirection', target_direction_name
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    old_direction,
    old_group,
    new_direction,
    new_group,
    previous_course,
    next_course
)
SELECT
    '2025-TDR-' || lpad(ord::text, 2, '0') AS number,
    CASE WHEN ord <= 3 THEN DATE '2025-01-25' ELSE DATE '2025-06-25' END AS order_date,
    'TRANSFER_DIRECTION' AS type,
    'Перевести студентов на другое направление подготовки по личным заявлениям.' AS text,
    CASE WHEN ord <= 3 THEN DATE '2025-01-26' ELSE DATE '2025-06-26' END AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    student_ids,
    student_items_json,
    'личное заявление студента' AS basis,
    target_direction_name AS direction_name,
    source_direction_name AS old_direction,
    source_group_code AS old_group,
    target_direction_name AS new_direction,
    target_group_code AS new_group,
    course AS previous_course,
    course AS next_course
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 8.4 ACADEMIC_LEAVE (5)
-- ---------------------------------------------------------
WITH candidates AS (
    SELECT
        g.id AS group_id,
        g.code AS group_code,
        g.course,
        d.name AS direction_name,
        f.name AS faculty_name,
        count(*) AS cnt,
        row_number() OVER (ORDER BY count(*) DESC, g.id) AS ord
    FROM students s
    JOIN student_groups g ON g.id = s.group_id
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE s.status = 'ACADEMIC_LEAVE'
    GROUP BY g.id, g.code, g.course, d.name, f.name
    HAVING count(*) >= 5
),
plans AS (
    SELECT
        ord,
        group_id,
        group_code,
        course,
        direction_name,
        faculty_name
    FROM candidates
    WHERE ord <= 5
),
students_ranked AS (
    SELECT
        p.ord,
        p.group_code,
        p.course,
        p.direction_name,
        p.faculty_name,
        CASE WHEN p.ord <= 3 THEN DATE '2025-01-26' ELSE DATE '2025-06-26' END AS period_start,
        CASE WHEN p.ord <= 3 THEN DATE '2025-07-25' ELSE DATE '2025-12-23' END AS period_end,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM plans p
    JOIN students s
      ON s.group_id = p.group_id
     AND s.status = 'ACADEMIC_LEAVE'
),
students_in_plan AS (
    SELECT *
    FROM students_ranked
    WHERE rn <= 8
),
payload AS (
    SELECT
        ord,
        min(group_code) AS group_code,
        min(course) AS course,
        min(direction_name) AS direction_name,
        min(faculty_name) AS faculty_name,
        min(period_start) AS period_start,
        min(period_end) AS period_end,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'медицинское заключение и личное заявление студента',
                'fromCourse', course,
                'facultyName', faculty_name,
                'fromGroup', group_code,
                'fromDirection', direction_name,
                'educationForm', 'Очная',
                'educationBase', 'Бюджет',
                'periodStart', period_start,
                'periodEnd', period_end
            ) ORDER BY rn
        )::text AS student_items_json
    FROM students_in_plan
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    period_start,
    period_end,
    basis,
    direction_name,
    group_code,
    education_form,
    education_base
)
SELECT
    '2025-ACL-' || lpad(ord::text, 2, '0') AS number,
    CASE WHEN ord <= 3 THEN DATE '2025-01-25' ELSE DATE '2025-06-25' END AS order_date,
    'ACADEMIC_LEAVE' AS type,
    'Предоставить академический отпуск студентам на основании подтверждающих документов.' AS text,
    CASE WHEN ord <= 3 THEN DATE '2025-01-26' ELSE DATE '2025-06-26' END AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    student_ids,
    student_items_json,
    period_start,
    period_end,
    'медицинское заключение и личное заявление' AS basis,
    direction_name,
    group_code,
    'Очная' AS education_form,
    'Бюджет' AS education_base
FROM payload
ORDER BY ord;

-- ---------------------------------------------------------
-- 8.5 EXPULSION (5)
-- ---------------------------------------------------------
WITH expelled AS (
    SELECT
        s.id AS student_id,
        s.course,
        g.code AS group_code,
        d.name AS direction_name,
        f.name AS faculty_name,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (ORDER BY s.id) AS rn_all
    FROM students s
    JOIN student_groups g ON g.id = s.group_id
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE s.status = 'EXPELLED'
),
expelled_2025 AS (
    SELECT
        student_id,
        course,
        group_code,
        direction_name,
        faculty_name,
        student_name,
        row_number() OVER (ORDER BY rn_all) AS rn_year
    FROM expelled
    WHERE rn_all <= 25
),
ranked AS (
    SELECT
        ntile(5) OVER (ORDER BY rn_year) AS ord,
        student_id,
        course,
        group_code,
        direction_name,
        faculty_name,
        student_name,
        rn_year
    FROM expelled_2025
),
batched AS (
    SELECT
        ord,
        student_id,
        course,
        group_code,
        direction_name,
        faculty_name,
        student_name,
        row_number() OVER (PARTITION BY ord ORDER BY rn_year) AS local_rn
    FROM ranked
),
payload AS (
    SELECT
        ord,
        string_agg(student_id::text, ',' ORDER BY local_rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'личное заявление студента об отчислении',
                'fromCourse', course,
                'facultyName', faculty_name,
                'fromGroup', group_code,
                'fromDirection', direction_name,
                'contractInfo', 'академическая справка выдать по запросу'
            ) ORDER BY local_rn
        )::text AS student_items_json
    FROM batched
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    student_ids,
    student_items_json,
    basis,
    expel_date,
    contract_info
)
SELECT
    '2025-EXP-' || lpad(ord::text, 2, '0') AS number,
    CASE WHEN ord <= 3 THEN DATE '2025-01-25' ELSE DATE '2025-06-25' END AS order_date,
    'EXPULSION' AS type,
    'Отчислить студентов по собственному желанию в конце семестра.' AS text,
    CASE WHEN ord <= 3 THEN DATE '2025-01-26' ELSE DATE '2025-06-26' END AS sign_date,
    'Ректор' AS signer_position,
    'С.В. Ершов' AS signer_name,
    student_ids,
    student_items_json,
    'личное заявление студента' AS basis,
    CASE WHEN ord <= 3 THEN DATE '2025-01-25' ELSE DATE '2025-06-25' END AS expel_date,
    'академическая справка выдать по запросу' AS contract_info
FROM payload
ORDER BY ord;

-- =========================================================
-- 9) Финальная актуализация данных перед историей
-- =========================================================

-- 9.1 Дозаполняем группы ПИбд до 30 студентов в каждой группе
WITH target_groups AS (
    SELECT
        g.id AS group_id,
        g.code,
        g.course,
        coalesce(g.education_form, 'FULL_TIME') AS group_education_form
    FROM student_groups g
    WHERE g.code ~ '^ПИбд-[1-4][1-3]$'
),
need AS (
    SELECT
        tg.group_id,
        tg.code,
        tg.course,
        tg.group_education_form,
        greatest(0, 30 - count(s.id)) AS need_count
    FROM target_groups tg
    LEFT JOIN students s ON s.group_id = tg.group_id
    GROUP BY tg.group_id, tg.code, tg.course, tg.group_education_form
    HAVING greatest(0, 30 - count(s.id)) > 0
),
expanded AS (
    SELECT
        n.group_id,
        n.code,
        n.course,
        n.group_education_form,
        gs.n,
        row_number() OVER (ORDER BY n.group_id, gs.n) AS rn,
        (2027 - n.course)::int AS admission_year
    FROM need n
    JOIN LATERAL generate_series(1, n.need_count) AS gs(n) ON true
),
numbered AS (
    SELECT
        e.*,
        to_char(make_date(e.admission_year, 9, 1), 'YY') AS admission_year_yy,
        row_number() OVER (PARTITION BY e.admission_year ORDER BY e.group_id, e.n) AS seq_in_year
    FROM expanded e
),
record_book_max AS (
    SELECT
        split_part(record_book, '/', 1) AS year_yy,
        max(split_part(record_book, '/', 2)::int) AS max_suffix
    FROM students
    WHERE record_book ~ '^[0-9]{2}/[0-9]{3,}$'
    GROUP BY split_part(record_book, '/', 1)
),
contract_max AS (
    SELECT
        split_part(study_contract_number, '-', 1) AS year_full,
        max(split_part(study_contract_number, '-', 3)::int) AS max_suffix
    FROM students
    WHERE study_contract_number ~ '^[0-9]{4}-З-[0-9]{3,}$'
    GROUP BY split_part(study_contract_number, '-', 1)
)
INSERT INTO students (
    last_name,
    first_name,
    middle_name,
    record_book,
    course,
    status,
    birth_date,
    phone,
    email,
    group_id,
    education_form,
    education_base,
    study_contract_number,
    study_start_date
)
SELECT
    CASE WHEN mod(n.rn, 2) = 0 THEN 'Алексеев' ELSE 'Соколов' END AS last_name,
    CASE
        WHEN mod(n.rn, 5) = 0 THEN 'Артём'
        WHEN mod(n.rn, 5) = 1 THEN 'Кирилл'
        WHEN mod(n.rn, 5) = 2 THEN 'Роман'
        WHEN mod(n.rn, 5) = 3 THEN 'Марина'
        ELSE 'Анна'
    END AS first_name,
    CASE
        WHEN mod(n.rn, 2) = 0 THEN 'Андреевич'
        ELSE 'Витальевна'
    END AS middle_name,
    n.admission_year_yy || '/' || lpad((coalesce(rbm.max_suffix, 0) + n.seq_in_year)::text, 3, '0') AS record_book,
    n.course,
    'ACTIVE'::varchar AS status,
    make_date(
        (2000 + ((n.rn + 7) % 7))::int,
        (1 + (n.rn % 12))::int,
        (1 + (n.rn % 27))::int
    ) AS birth_date,
    '+79' || lpad((700000000 + n.rn)::text, 9, '0') AS phone,
    'pi-extra-' || n.rn::text || '@piaps.local' AS email,
    n.group_id,
    CASE
        WHEN n.group_education_form = 'PART_TIME' THEN 'Очно-заочная'
        WHEN n.group_education_form = 'DISTANCE' THEN 'Заочная'
        ELSE 'Очная'
    END AS education_form,
    CASE WHEN mod(n.rn, 3) = 0 THEN 'Внебюджет' ELSE 'Бюджет' END AS education_base,
    n.admission_year::text || '-З-' || lpad((coalesce(cm.max_suffix, 0) + n.seq_in_year)::text, 3, '0') AS study_contract_number,
    make_date(n.admission_year, 9, 1) AS study_start_date
FROM numbered n
LEFT JOIN record_book_max rbm ON rbm.year_yy = n.admission_year_yy
LEFT JOIN contract_max cm ON cm.year_full = n.admission_year::text;

-- 9.2 Статус NEW: выделяем пул первокурсников для приказов на зачисление
WITH new_candidates AS (
    SELECT s.id
    FROM students s
    JOIN student_groups g ON g.id = s.group_id
    WHERE s.status = 'ACTIVE'
      AND g.course = 1
    ORDER BY s.id
    LIMIT 180
)
UPDATE students s
SET status = 'NEW',
    study_start_date = NULL
WHERE s.id IN (SELECT id FROM new_candidates);

-- 9.3 Приказы: оставляем только 2026 год
DELETE FROM orders
WHERE extract(year FROM order_date) <> 2026;

-- 9.3.1 Пересоздаём приказы нужных типов: по 3 штуки на каждый
DELETE FROM orders
WHERE type IN ('ACADEMIC_LEAVE', 'TRANSFER_DIRECTION', 'TRANSFER_NEXT_COURSE');

-- TRANSFER_NEXT_COURSE (3)
WITH tnc_candidates AS (
    SELECT
        g.id AS source_group_id,
        g.code AS source_group_code,
        g.course AS from_course,
        d.id AS direction_id,
        d.code AS direction_code,
        d.name AS direction_name,
        f.name AS faculty_name,
        f.short_name AS faculty_short_name,
        tg.id AS target_group_id,
        tg.code AS target_group_code,
        row_number() OVER (ORDER BY f.id, d.id, g.course, g.id) AS ord
    FROM student_groups g
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    JOIN LATERAL (
        SELECT
            g2.id,
            g2.code
        FROM student_groups g2
        WHERE g2.direction_id = g.direction_id
          AND g2.course = g.course + 1
          AND coalesce(g2.education_level, 'BACHELOR') = coalesce(g.education_level, 'BACHELOR')
          AND coalesce(g2.education_form, 'FULL_TIME') = coalesce(g.education_form, 'FULL_TIME')
          AND coalesce(g2.accelerated, false) = coalesce(g.accelerated, false)
          AND coalesce(g2.group_number, right(g2.code, 1)::int) = coalesce(g.group_number, right(g.code, 1)::int)
        ORDER BY g2.id
        LIMIT 1
    ) tg ON true
    WHERE g.course BETWEEN 1 AND 4
      AND EXISTS (
        SELECT 1
        FROM students s
        WHERE s.group_id = g.id
          AND s.status = 'ACTIVE'
      )
),
tnc_plans AS (
    SELECT *
    FROM tnc_candidates
    WHERE ord <= 3
),
tnc_students AS (
    SELECT
        p.ord,
        p.source_group_code,
        p.target_group_code,
        p.from_course,
        p.from_course + 1 AS to_course,
        p.direction_id,
        p.direction_code,
        p.direction_name,
        p.faculty_name,
        p.faculty_short_name,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM tnc_plans p
    JOIN students s
      ON s.group_id = p.source_group_id
     AND s.status = 'ACTIVE'
),
tnc_payload AS (
    SELECT
        ord,
        min(source_group_code) AS source_group_code,
        min(target_group_code) AS target_group_code,
        min(from_course) AS from_course,
        min(to_course) AS to_course,
        min(direction_id) AS direction_id,
        min(direction_code) AS direction_code,
        min(direction_name) AS direction_name,
        min(faculty_name) AS faculty_name,
        min(faculty_short_name) AS faculty_short_name,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'на основании завершённой сессии без академических задолженностей и решения деканата',
                'fromCourse', from_course,
                'toCourse', to_course,
                'facultyName', faculty_name,
                'facultyShortName', faculty_short_name,
                'fromGroup', source_group_code,
                'toGroup', target_group_code,
                'fromDirection', direction_code || ' "' || direction_name || '"',
                'toDirection', direction_code || ' "' || direction_name || '"',
                'fromDirectionId', direction_id,
                'toDirectionId', direction_id
            ) ORDER BY rn
        )::text AS student_items_json
    FROM tnc_students
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    students_list,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    old_direction,
    old_group,
    new_direction,
    new_group,
    previous_course,
    next_course,
    executed,
    signed
)
SELECT
    '2026-К-' || lpad(ord::text, 3, '0') AS number,
    DATE '2026-06-25' AS order_date,
    'TRANSFER_NEXT_COURSE' AS type,
    'Перевести студентов на следующий курс по итогам учебного года.' AS text,
    DATE '2026-06-26' AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    NULL AS students_list,
    student_ids,
    student_items_json,
    'на основании завершённой сессии без академических задолженностей и решения деканата' AS basis,
    direction_code || ' "' || direction_name || '"' AS direction_name,
    direction_code || ' "' || direction_name || '"' AS old_direction,
    source_group_code AS old_group,
    direction_code || ' "' || direction_name || '"' AS new_direction,
    target_group_code AS new_group,
    from_course AS previous_course,
    to_course AS next_course,
    false AS executed,
    false AS signed
FROM tnc_payload
ORDER BY ord;

-- TRANSFER_DIRECTION (3)
WITH tdr_dir_map AS (
    SELECT
        d.id AS source_direction_id,
        d.code AS source_direction_code,
        d.name AS source_direction_name,
        d.faculty_id,
        coalesce(
            lead(d.id) OVER (PARTITION BY d.faculty_id ORDER BY d.id),
            first_value(d.id) OVER (PARTITION BY d.faculty_id ORDER BY d.id)
        ) AS target_direction_id
    FROM directions d
),
tdr_candidates AS (
    SELECT
        g.id AS source_group_id,
        g.code AS source_group_code,
        g.course AS course,
        dm.source_direction_id,
        dm.source_direction_code,
        dm.source_direction_name,
        td.id AS target_direction_id,
        td.code AS target_direction_code,
        td.name AS target_direction_name,
        f.name AS faculty_name,
        f.short_name AS faculty_short_name,
        tg.id AS target_group_id,
        tg.code AS target_group_code,
        row_number() OVER (ORDER BY f.id, g.id) AS ord
    FROM student_groups g
    JOIN tdr_dir_map dm ON dm.source_direction_id = g.direction_id
    JOIN faculties f ON f.id = dm.faculty_id
    JOIN directions td ON td.id = dm.target_direction_id
    JOIN LATERAL (
        SELECT
            g2.id,
            g2.code
        FROM student_groups g2
        WHERE g2.direction_id = dm.target_direction_id
          AND g2.course = g.course
          AND coalesce(g2.education_level, 'BACHELOR') = coalesce(g.education_level, 'BACHELOR')
          AND coalesce(g2.education_form, 'FULL_TIME') = coalesce(g.education_form, 'FULL_TIME')
          AND coalesce(g2.accelerated, false) = coalesce(g.accelerated, false)
          AND coalesce(g2.group_number, right(g2.code, 1)::int) = coalesce(g.group_number, right(g.code, 1)::int)
        ORDER BY g2.id
        LIMIT 1
    ) tg ON true
    WHERE dm.target_direction_id <> g.direction_id
      AND EXISTS (
        SELECT 1
        FROM students s
        WHERE s.group_id = g.id
          AND s.status = 'ACTIVE'
      )
),
tdr_plans AS (
    SELECT *
    FROM tdr_candidates
    WHERE ord <= 3
),
tdr_students AS (
    SELECT
        p.ord,
        p.source_group_code,
        p.target_group_code,
        p.course,
        p.source_direction_id,
        p.source_direction_code,
        p.source_direction_name,
        p.target_direction_id,
        p.target_direction_code,
        p.target_direction_name,
        p.faculty_name,
        p.faculty_short_name,
        CASE WHEN p.ord = 1 THEN DATE '2026-01-25' ELSE DATE '2026-06-25' END AS period_start,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM tdr_plans p
    JOIN students s
      ON s.group_id = p.source_group_id
     AND s.status = 'ACTIVE'
),
tdr_payload AS (
    SELECT
        ord,
        min(source_group_code) AS source_group_code,
        min(target_group_code) AS target_group_code,
        min(course) AS course,
        min(source_direction_id) AS source_direction_id,
        min(source_direction_code) AS source_direction_code,
        min(source_direction_name) AS source_direction_name,
        min(target_direction_id) AS target_direction_id,
        min(target_direction_code) AS target_direction_code,
        min(target_direction_name) AS target_direction_name,
        min(faculty_name) AS faculty_name,
        min(faculty_short_name) AS faculty_short_name,
        min(period_start) AS period_start,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'на основании заявления студента и решения комиссии',
                'fromCourse', course,
                'toCourse', course,
                'facultyName', faculty_name,
                'facultyShortName', faculty_short_name,
                'fromGroup', source_group_code,
                'toGroup', target_group_code,
                'fromDirection', source_direction_code || ' "' || source_direction_name || '"',
                'toDirection', target_direction_code || ' "' || target_direction_name || '"',
                'fromDirectionId', source_direction_id,
                'toDirectionId', target_direction_id,
                'periodStart', period_start
            ) ORDER BY rn
        )::text AS student_items_json
    FROM tdr_students
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    students_list,
    student_ids,
    student_items_json,
    basis,
    direction_name,
    old_direction,
    old_group,
    new_direction,
    new_group,
    previous_course,
    next_course,
    executed,
    signed
)
SELECT
    '2026-П-' || lpad(ord::text, 3, '0') AS number,
    period_start AS order_date,
    'TRANSFER_DIRECTION' AS type,
    'Перевести студентов на другое направление подготовки по личным заявлениям.' AS text,
    period_start + 1 AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    NULL AS students_list,
    student_ids,
    student_items_json,
    'на основании заявления студента и решения комиссии' AS basis,
    target_direction_code || ' "' || target_direction_name || '"' AS direction_name,
    source_direction_code || ' "' || source_direction_name || '"' AS old_direction,
    source_group_code AS old_group,
    target_direction_code || ' "' || target_direction_name || '"' AS new_direction,
    target_group_code AS new_group,
    course AS previous_course,
    course AS next_course,
    false AS executed,
    false AS signed
FROM tdr_payload
ORDER BY ord;

-- ACADEMIC_LEAVE (3)
WITH acl_candidates AS (
    SELECT
        g.id AS group_id,
        g.code AS group_code,
        g.course AS course,
        d.id AS direction_id,
        d.code AS direction_code,
        d.name AS direction_name,
        f.name AS faculty_name,
        f.short_name AS faculty_short_name,
        row_number() OVER (ORDER BY f.id, d.id, g.id) AS ord
    FROM student_groups g
    JOIN directions d ON d.id = g.direction_id
    JOIN faculties f ON f.id = d.faculty_id
    WHERE EXISTS (
        SELECT 1
        FROM students s
        WHERE s.group_id = g.id
          AND s.status = 'ACTIVE'
    )
),
acl_plans AS (
    SELECT *
    FROM acl_candidates
    WHERE ord <= 3
),
acl_students AS (
    SELECT
        p.ord,
        p.group_code,
        p.course,
        p.direction_id,
        p.direction_code,
        p.direction_name,
        p.faculty_name,
        p.faculty_short_name,
        CASE
            WHEN p.ord = 1 THEN DATE '2026-01-25'
            WHEN p.ord = 2 THEN DATE '2026-06-25'
            ELSE DATE '2026-06-26'
        END AS period_start,
        CASE
            WHEN p.ord = 1 THEN DATE '2026-07-25'
            WHEN p.ord = 2 THEN DATE '2026-12-25'
            ELSE DATE '2026-12-26'
        END AS period_end,
        s.id AS student_id,
        concat_ws(' ', s.last_name, s.first_name, s.middle_name) AS student_name,
        s.education_form,
        s.education_base,
        row_number() OVER (PARTITION BY p.ord ORDER BY s.last_name, s.first_name, s.middle_name, s.id) AS rn
    FROM acl_plans p
    JOIN students s
      ON s.group_id = p.group_id
     AND s.status = 'ACTIVE'
),
acl_selected AS (
    SELECT *
    FROM acl_students
    WHERE rn <= 10
),
acl_payload AS (
    SELECT
        ord,
        min(group_code) AS group_code,
        min(course) AS course,
        min(direction_id) AS direction_id,
        min(direction_code) AS direction_code,
        min(direction_name) AS direction_name,
        min(faculty_name) AS faculty_name,
        min(faculty_short_name) AS faculty_short_name,
        min(period_start) AS period_start,
        min(period_end) AS period_end,
        string_agg(student_id::text, ',' ORDER BY rn) AS student_ids,
        jsonb_agg(
            jsonb_build_object(
                'studentId', student_id,
                'studentName', student_name,
                'basis', 'заявление студента с визой декана',
                'fromCourse', course,
                'facultyName', faculty_name,
                'facultyShortName', faculty_short_name,
                'fromGroup', group_code,
                'fromDirection', direction_code || ' "' || direction_name || '"',
                'fromDirectionId', direction_id,
                'educationForm', coalesce(education_form, 'Очная'),
                'educationBase', coalesce(education_base, 'Бюджет'),
                'periodStart', period_start,
                'periodEnd', period_end
            ) ORDER BY rn
        )::text AS student_items_json
    FROM acl_selected
    GROUP BY ord
)
INSERT INTO orders (
    number,
    order_date,
    type,
    text,
    sign_date,
    signer_position,
    signer_name,
    students_list,
    student_ids,
    student_items_json,
    period_start,
    period_end,
    basis,
    direction_name,
    group_code,
    education_form,
    education_base,
    executed,
    signed
)
SELECT
    '2026-А-' || lpad(ord::text, 3, '0') AS number,
    period_start AS order_date,
    'ACADEMIC_LEAVE' AS type,
    'Предоставить академический отпуск студентам на основании подтверждающих документов.' AS text,
    period_start + 1 AS sign_date,
    'Проректор по учебной работе' AS signer_position,
    'Н.Н. Андреева' AS signer_name,
    NULL AS students_list,
    student_ids,
    student_items_json,
    period_start,
    period_end,
    'заявление студента с визой декана' AS basis,
    direction_code || ' "' || direction_name || '"' AS direction_name,
    group_code,
    'Очная' AS education_form,
    'Бюджет' AS education_base,
    false AS executed,
    false AS signed
FROM acl_payload
ORDER BY ord;

-- 9.3.2 Оставляем по 3 массовых приказа на каждый тип
WITH ranked AS (
    SELECT
        id,
        row_number() OVER (PARTITION BY type ORDER BY order_date, id) AS rn
    FROM orders
)
DELETE FROM orders o
USING ranked r
WHERE o.id = r.id
  AND r.rn > 3;

WITH renumber AS (
    SELECT
        id,
        type,
        row_number() OVER (PARTITION BY type ORDER BY order_date, id) AS rn
    FROM orders
)
UPDATE orders o
SET number = '2026-' ||
             CASE r.type
                 WHEN 'ACADEMIC_LEAVE' THEN 'А'
                 WHEN 'ENROLLMENT' THEN 'З'
                 WHEN 'EXPULSION' THEN 'О'
                 WHEN 'TRANSFER_DIRECTION' THEN 'П'
                 WHEN 'TRANSFER_NEXT_COURSE' THEN 'К'
             END ||
             '-' || lpad(r.rn::text, 3, '0')
FROM renumber r
WHERE o.id = r.id;

UPDATE orders
SET executed = false,
    executed_at = NULL,
    execution_snapshot_json = NULL,
    signed = false,
    signed_at = NULL;

WITH enrollment_students AS (
    SELECT DISTINCT trim(v)::bigint AS student_id
    FROM orders o
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(o.student_ids, ''), ',') AS v
    WHERE o.type = 'ENROLLMENT'
      AND trim(v) ~ '^[0-9]+$'
)
UPDATE students s
SET status = 'NEW',
    study_start_date = NULL
WHERE s.id IN (SELECT student_id FROM enrollment_students);

-- =========================================================
-- 10) История состояния студентов
--    Богатая периодизация 2022..2026:
--    - годовые переходы по курсам;
--    - дополнительные эпизоды академического отпуска с возвратом;
--    - терминальные статусы (академ/отчисление/выпуск) с распределением в 2025..2026.
-- =========================================================
WITH student_base AS (
    SELECT
        s.id AS student_id,
        s.status AS current_status,
        s.course AS current_course,
        s.group_id AS current_group_id,
        coalesce(
            s.study_start_date,
            make_date(2027 - greatest(1, s.course), 9, 1)
        ) AS study_start_date_base,
        CASE
            WHEN s.status IN ('ACADEMIC_LEAVE', 'EXPELLED', 'GRADUATED')
                THEN greatest(s.course - 1, 0)
            ELSE s.course
        END AS active_course_limit,
        cg.direction_id AS direction_id,
        coalesce(cg.education_level, 'BACHELOR') AS education_level,
        coalesce(cg.education_form, 'FULL_TIME') AS education_form,
        coalesce(cg.accelerated, false) AS accelerated,
        coalesce(cg.group_number, right(cg.code, 1)::int) AS group_number,
        (abs(hashtext('hist:' || s.id::text)) % 6)::int AS status_variant
    FROM students s
    JOIN student_groups cg ON cg.id = s.group_id
),
course_history AS (
    SELECT
        b.student_id,
        (
            b.study_start_date_base
            + (gs.step - 1) * interval '1 year'
        )::date AS effective_date,
        'ACTIVE'::varchar AS status,
        gs.step AS course,
        hg.id AS group_id
    FROM student_base b
    JOIN LATERAL generate_series(1, b.active_course_limit) AS gs(step) ON true
    JOIN student_groups hg
      ON hg.direction_id = b.direction_id
     AND hg.course = gs.step
     AND coalesce(hg.education_level, 'BACHELOR') = b.education_level
     AND coalesce(hg.education_form, 'FULL_TIME') = b.education_form
     AND coalesce(hg.accelerated, false) = b.accelerated
     AND coalesce(hg.group_number, right(hg.code, 1)::int) = b.group_number
),
episode_candidates AS (
    SELECT
        b.student_id,
        b.study_start_date_base,
        extract(year FROM b.study_start_date_base)::int AS base_year,
        b.current_course,
        b.direction_id,
        b.education_level,
        b.education_form,
        b.accelerated,
        b.group_number,
        greatest(
            2024,
            least(
                2026,
                extract(year FROM b.study_start_date_base)::int
                + ((abs(hashtext('ep-year:' || b.student_id::text)) % 3)::int)
            )
        )::int AS episode_year
    FROM student_base b
    WHERE b.current_status IN ('ACTIVE', 'NEW')
      AND b.current_course >= 2
      AND (abs(hashtext('ep-pick:' || b.student_id::text)) % 100) < 62
),
episode_leave AS (
    SELECT
        e.student_id,
        make_date(
            e.episode_year,
            CASE (abs(hashtext('ep-month:' || e.student_id::text)) % 3)
                WHEN 0 THEN 1
                WHEN 1 THEN 4
                ELSE 9
            END,
            CASE
                WHEN (abs(hashtext('ep-day:' || e.student_id::text)) % 2) = 0 THEN 12
                ELSE 24
            END
        ) AS effective_date,
        'ACADEMIC_LEAVE'::varchar AS status,
        greatest(1, least(e.current_course, e.episode_year - e.base_year + 1))::int AS course,
        hg.id AS group_id
    FROM episode_candidates e
    JOIN student_groups hg
      ON hg.direction_id = e.direction_id
     AND hg.course = greatest(1, least(e.current_course, e.episode_year - e.base_year + 1))
     AND coalesce(hg.education_level, 'BACHELOR') = e.education_level
     AND coalesce(hg.education_form, 'FULL_TIME') = e.education_form
     AND coalesce(hg.accelerated, false) = e.accelerated
     AND coalesce(hg.group_number, right(hg.code, 1)::int) = e.group_number
),
episode_return AS (
    SELECT
        l.student_id,
        least(
            (
                l.effective_date
                + ((4 + (abs(hashtext('ep-ret:' || l.student_id::text)) % 4))::text || ' months')::interval
            )::date,
            DATE '2026-12-20'
        ) AS effective_date,
        'ACTIVE'::varchar AS status,
        l.course,
        l.group_id
    FROM episode_leave l
),
final_status_history AS (
    SELECT
        b.student_id,
        CASE b.current_status
            WHEN 'ACADEMIC_LEAVE' THEN
                (
                    anchor.anchor_date
                    + ((3 + (b.status_variant % 4))::text || ' months')::interval
                )::date
            WHEN 'EXPELLED' THEN
                (
                    anchor.anchor_date
                    + ((2 + (b.status_variant % 4))::text || ' months')::interval
                )::date
            WHEN 'GRADUATED' THEN
                (
                    anchor.anchor_date
                    + ((2 + (b.status_variant % 7))::text || ' months')::interval
                )::date
            ELSE NULL::date
        END AS effective_date,
        b.current_status::varchar AS status,
        greatest(1, b.current_course)::int AS course,
        hg.id AS group_id
    FROM student_base b
    JOIN LATERAL (
        SELECT (
            b.study_start_date_base
            + greatest(b.active_course_limit - 1, 0) * interval '1 year'
        )::date AS anchor_date
    ) anchor ON true
    JOIN student_groups hg
      ON hg.direction_id = b.direction_id
     AND hg.course = greatest(1, b.current_course)
     AND coalesce(hg.education_level, 'BACHELOR') = b.education_level
     AND coalesce(hg.education_form, 'FULL_TIME') = b.education_form
     AND coalesce(hg.accelerated, false) = b.accelerated
     AND coalesce(hg.group_number, right(hg.code, 1)::int) = b.group_number
    WHERE b.current_status IN ('ACADEMIC_LEAVE', 'EXPELLED', 'GRADUATED')
),
history_rows AS (
    SELECT * FROM course_history
    UNION ALL
    SELECT * FROM episode_leave
    UNION ALL
    SELECT * FROM episode_return
    UNION ALL
    SELECT * FROM final_status_history WHERE effective_date IS NOT NULL
),
history_dedup AS (
    SELECT DISTINCT ON (student_id, effective_date, status, course, group_id)
        student_id,
        effective_date,
        status,
        course,
        group_id
    FROM history_rows
    ORDER BY student_id, effective_date, status, course, group_id
)
INSERT INTO student_state_history (
    student_id,
    effective_date,
    status,
    course,
    group_id,
    order_id,
    created_at
)
SELECT
    h.student_id,
    h.effective_date,
    h.status,
    h.course,
    h.group_id,
    NULL AS order_id,
    h.effective_date::timestamp + interval '12 hours' AS created_at
FROM history_dedup h
ORDER BY
    h.student_id,
    h.effective_date,
    CASE WHEN h.status = 'ACTIVE' THEN 0 ELSE 1 END,
    h.course;
