-- Базовые справочники (идемпотентно)
INSERT INTO faculties (code, name) VALUES
    ('FIAT', 'Факультет информационных и авиационных технологий'),
    ('FEU', 'Факультет экономики и управления'),
    ('FRT', 'Факультет радиотехники и электроники'),
    ('FGN', 'Факультет гуманитарных наук')
ON CONFLICT (code) DO NOTHING;

INSERT INTO directions (code, name, faculty_id) VALUES
    ('09.03.01', 'Информатика и вычислительная техника', (SELECT id FROM faculties WHERE code = 'FIAT')),
    ('38.03.05', 'Бизнес-информатика', (SELECT id FROM faculties WHERE code = 'FEU')),
    ('11.03.04', 'Электроника и наноэлектроника', (SELECT id FROM faculties WHERE code = 'FRT')),
    ('13.03.02', 'Электроэнергетика и электротехника', (SELECT id FROM faculties WHERE code = 'FRT')),
    ('45.03.02', 'Лингвистика', (SELECT id FROM faculties WHERE code = 'FGN')),
    ('42.03.01', 'Реклама и связи с общественностью', (SELECT id FROM faculties WHERE code = 'FGN'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO student_groups (code, course, direction_id) VALUES
    ('ПИ-101', 1, (SELECT id FROM directions WHERE code = '09.03.01')),
    ('ПИ-201', 2, (SELECT id FROM directions WHERE code = '09.03.01')),
    ('ПИ-301', 3, (SELECT id FROM directions WHERE code = '09.03.01')),
    ('ПИ-401', 4, (SELECT id FROM directions WHERE code = '09.03.01')),
    ('БИ-101', 1, (SELECT id FROM directions WHERE code = '38.03.05')),
    ('БИ-301', 3, (SELECT id FROM directions WHERE code = '38.03.05')),
    ('ЭН-201', 2, (SELECT id FROM directions WHERE code = '11.03.04')),
    ('ЭН-301', 3, (SELECT id FROM directions WHERE code = '11.03.04')),
    ('ЭЭ-201', 2, (SELECT id FROM directions WHERE code = '13.03.02')),
    ('ЛИН-101', 1, (SELECT id FROM directions WHERE code = '45.03.02')),
    ('ЛИН-201', 2, (SELECT id FROM directions WHERE code = '45.03.02')),
    ('РСО-201', 2, (SELECT id FROM directions WHERE code = '42.03.01'))
ON CONFLICT (code) DO NOTHING;

-- Студенты
INSERT INTO students (last_name, first_name, middle_name, record_book, course, status, birth_date, phone, email, group_id, enrollment_date) VALUES
    ('Иванов', 'Пётр', 'Сергеевич', 'RB-1001', 2, 'ACTIVE', DATE '2004-03-12', '+79990000001', 'ivanov@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-201'), DATE '2023-09-01'),
    ('Смирнова', 'Анна', 'Игоревна', 'RB-1002', 4, 'ACADEMIC_LEAVE', DATE '2002-08-21', '+79990000002', 'smirnova@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-401'), DATE '2021-09-01'),
    ('Петров', 'Алексей', 'Дмитриевич', 'RB-1003', 3, 'ACTIVE', DATE '2003-12-02', '+79990000003', 'petrov@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-301'), DATE '2022-09-01'),
    ('Громов', 'Семен', 'Владимирович', 'RB-1004', 2, 'EXPELLED', DATE '2004-07-30', '+79990000004', 'gromov@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-201'), DATE '2023-09-01'),
    ('Кузнецова', 'Екатерина', 'Павловна', 'RB-1005', 1, 'ACTIVE', DATE '2005-04-11', '+79990000005', 'kuznetsova@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-101'), DATE '2024-09-01'),
    ('Сидоров', 'Максим', 'Олегович', 'RB-1006', 1, 'ACTIVE', DATE '2005-10-05', '+79990000006', 'sidorov@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-101'), DATE '2024-09-01'),
    ('Андреева', 'Мария', 'Дмитриевна', 'RB-1007', 1, 'ACTIVE', DATE '2005-06-17', '+79990000007', 'andreeva@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-101'), DATE '2024-09-01'),
    ('Воронов', 'Илья', 'Константинович', 'RB-1008', 2, 'ACADEMIC_LEAVE', DATE '2003-11-25', '+79990000008', 'voronov@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-201'), DATE '2023-09-01'),
    ('Беляева', 'Ольга', 'Сергеевна', 'RB-1009', 3, 'ACTIVE', DATE '2003-02-14', '+79990000009', 'belyaeva@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-301'), DATE '2022-09-01'),
    ('Зайцев', 'Артур', 'Николаевич', 'RB-1010', 4, 'GRADUATED', DATE '2001-12-09', '+79990000010', 'zaitsev@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-401'), DATE '2020-09-01'),
    ('Егорова', 'Виктория', 'Алексеевна', 'RB-1011', 4, 'ACTIVE', DATE '2002-05-20', '+79990000011', 'egorova@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-401'), DATE '2021-09-01'),
    ('Тихонов', 'Георгий', 'Ильич', 'RB-1012', 3, 'ACTIVE', DATE '2003-09-30', '+79990000012', 'tikhonov@example.com', (SELECT id FROM student_groups WHERE code = 'ПИ-301'), DATE '2022-09-01'),
    ('Новикова', 'Дарья', 'Андреевна', 'RB-1013', 1, 'ACTIVE', DATE '2005-01-15', '+79990000013', 'novikova@example.com', (SELECT id FROM student_groups WHERE code = 'БИ-101'), DATE '2024-09-01'),
    ('Фролов', 'Степан', 'Юрьевич', 'RB-1014', 1, 'ACTIVE', DATE '2005-03-28', '+79990000014', 'frolov@example.com', (SELECT id FROM student_groups WHERE code = 'БИ-101'), DATE '2024-09-01'),
    ('Киселёва', 'Алёна', 'Владимировна', 'RB-1015', 3, 'ACTIVE', DATE '2003-04-07', '+79990000015', 'kiseleva@example.com', (SELECT id FROM student_groups WHERE code = 'БИ-301'), DATE '2022-09-01'),
    ('Дроздов', 'Роман', 'Сергеевич', 'RB-1016', 3, 'EXPELLED', DATE '2003-07-19', '+79990000016', 'drozdov@example.com', (SELECT id FROM student_groups WHERE code = 'БИ-301'), DATE '2022-09-01'),
    ('Шмидт', 'Ева', 'Игоревна', 'RB-1017', 3, 'ACADEMIC_LEAVE', DATE '2003-08-03', '+79990000017', 'shmidt@example.com', (SELECT id FROM student_groups WHERE code = 'БИ-301'), DATE '2022-09-01'),
    ('Карпов', 'Павел', 'Николаевич', 'RB-1018', 2, 'ACTIVE', DATE '2004-02-22', '+79990000018', 'karpov@example.com', (SELECT id FROM student_groups WHERE code = 'ЭН-201'), DATE '2023-09-01'),
    ('Гаврилова', 'Юлия', 'Романовна', 'RB-1019', 2, 'ACTIVE', DATE '2004-11-11', '+79990000019', 'gavrilova@example.com', (SELECT id FROM student_groups WHERE code = 'ЭН-201'), DATE '2023-09-01'),
    ('Гусев', 'Михаил', 'Петрович', 'RB-1020', 3, 'ACTIVE', DATE '2003-10-01', '+79990000020', 'gusev@example.com', (SELECT id FROM student_groups WHERE code = 'ЭН-301'), DATE '2022-09-01'),
    ('Лапина', 'Ирина', 'Фёдоровна', 'RB-1021', 3, 'ACADEMIC_LEAVE', DATE '2003-01-05', '+79990000021', 'lapina@example.com', (SELECT id FROM student_groups WHERE code = 'ЭН-301'), DATE '2022-09-01'),
    ('Рыбаков', 'Даниил', 'Михайлович', 'RB-1022', 2, 'ACTIVE', DATE '2004-06-16', '+79990000022', 'rybakov@example.com', (SELECT id FROM student_groups WHERE code = 'ЭЭ-201'), DATE '2023-09-01'),
    ('Князева', 'Людмила', 'Сергеевна', 'RB-1023', 2, 'ACTIVE', DATE '2004-09-24', '+79990000023', 'knyazeva@example.com', (SELECT id FROM student_groups WHERE code = 'ЭЭ-201'), DATE '2023-09-01'),
    ('Чернова', 'Полина', 'Артёмовна', 'RB-1024', 1, 'ACTIVE', DATE '2005-12-30', '+79990000024', 'chernova@example.com', (SELECT id FROM student_groups WHERE code = 'ЛИН-101'), DATE '2024-09-01'),
    ('Мельников', 'Денис', 'Андреевич', 'RB-1025', 1, 'ACTIVE', DATE '2005-02-09', '+79990000025', 'melnikov@example.com', (SELECT id FROM student_groups WHERE code = 'ЛИН-101'), DATE '2024-09-01'),
    ('Сафронова', 'Елизавета', 'Ильинична', 'RB-1026', 2, 'ACTIVE', DATE '2004-03-18', '+79990000026', 'safronova@example.com', (SELECT id FROM student_groups WHERE code = 'ЛИН-201'), DATE '2023-09-01'),
    ('Орлов', 'Кирилл', 'Сергеевич', 'RB-1027', 2, 'EXPELLED', DATE '2004-08-27', '+79990000027', 'orlov@example.com', (SELECT id FROM student_groups WHERE code = 'ЛИН-201'), DATE '2023-09-01'),
    ('Жукова', 'Марина', 'Витальевна', 'RB-1028', 2, 'ACTIVE', DATE '2004-05-04', '+79990000028', 'zhukova@example.com', (SELECT id FROM student_groups WHERE code = 'РСО-201'), DATE '2023-09-01'),
    ('Денисов', 'Олег', 'Евгеньевич', 'RB-1029', 2, 'ACTIVE', DATE '2004-01-22', '+79990000029', 'denisov@example.com', (SELECT id FROM student_groups WHERE code = 'РСО-201'), DATE '2023-09-01')
ON CONFLICT (record_book) DO NOTHING;

-- Уникальность учебных планов для идемпотентности
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_course_discipline_direction
    ON curriculums(course, discipline, direction_id);

INSERT INTO curriculums (course, discipline, hours, attestation, direction_id) VALUES
    (1, 'Математический анализ', 108, 'Экзамен', (SELECT id FROM directions WHERE code = '09.03.01')),
    (1, 'Программирование на Java', 144, 'Зачёт с оценкой', (SELECT id FROM directions WHERE code = '09.03.01')),
    (2, 'Алгоритмы и структуры данных', 144, 'Экзамен', (SELECT id FROM directions WHERE code = '09.03.01')),
    (2, 'Базы данных и SQL', 108, 'Зачёт', (SELECT id FROM directions WHERE code = '09.03.01')),
    (3, 'Проектирование информационных систем', 126, 'Экзамен', (SELECT id FROM directions WHERE code = '09.03.01')),
    (4, 'Архитектура программных систем', 126, 'Экзамен', (SELECT id FROM directions WHERE code = '09.03.01')),
    (1, 'Введение в бизнес-информатику', 96, 'Зачёт', (SELECT id FROM directions WHERE code = '38.03.05')),
    (2, 'Управление требованиями', 108, 'Экзамен', (SELECT id FROM directions WHERE code = '38.03.05')),
    (3, 'ИТ-стратегия и управление портфелем проектов', 126, 'Экзамен', (SELECT id FROM directions WHERE code = '38.03.05')),
    (2, 'Электронные приборы и схемы', 144, 'Экзамен', (SELECT id FROM directions WHERE code = '11.03.04')),
    (3, 'Микроконтроллеры и встроенные системы', 144, 'Экзамен', (SELECT id FROM directions WHERE code = '11.03.04')),
    (2, 'Электрические машины', 126, 'Экзамен', (SELECT id FROM directions WHERE code = '13.03.02')),
    (3, 'Релейная защита и автоматика', 126, 'Экзамен', (SELECT id FROM directions WHERE code = '13.03.02')),
    (1, 'Практическая фонетика', 108, 'Зачёт с оценкой', (SELECT id FROM directions WHERE code = '45.03.02')),
    (2, 'Теория перевода', 126, 'Экзамен', (SELECT id FROM directions WHERE code = '45.03.02')),
    (2, 'Основы PR и медиапланирования', 108, 'Зачёт', (SELECT id FROM directions WHERE code = '42.03.01')),
    (3, 'Брендинг и креативные стратегии', 126, 'Экзамен', (SELECT id FROM directions WHERE code = '42.03.01'))
ON CONFLICT (course, discipline, direction_id) DO NOTHING;

-- Приказы (идемпотентно по номеру)
INSERT INTO orders (number, order_date, type, text, sign_date, signer_position, signer_name, students_list, period_start, period_end, basis, direction_name, group_code, education_form, education_base, cost_info, expel_date, contract_info, old_direction, old_group, new_direction, new_group, previous_course, next_course)
VALUES
    ('01-АКАД', DATE '2024-02-15', 'ACADEMIC_LEAVE',
     'В соответствии с российским законодательством и на основании Положения о порядке предоставления академических отпусков\n\nПРИКАЗЫВАЮ:\n\nПредоставить академический отпуск следующим студентам на период: с 2024-03-01 по 2024-08-31.\nОснование: заявление студента с визой декана',
     DATE '2024-02-16', 'Декан ФИиАТ', 'Е.В. Кузнецова', 'Иванов П.С.', DATE '2024-03-01', DATE '2024-08-31', 'заявление студента с визой декана', '09.03.01 Информатика и вычислительная техника', 'ПИ-201', 'Очная', 'Бюджет', null, null, null, null, null, null, null, null, null),
    ('02-ЗЧСЛ', DATE '2024-07-01', 'ENROLLMENT',
     'На основании Правил приёма в Ульяновский государственный технический университет и решения приёмной комиссии\n\nПРИКАЗЫВАЮ:\n\nЗачислить на первый курс студентов по указанным направлениям подготовки. Форма обучения: очная. Основа обучения: бюджет.',
     DATE '2024-07-02', 'Ответственный секретарь приёмной комиссии', 'И.И. Петрова', 'Список зачисления', null, null, null, '09.03.01 Информатика и вычислительная техника', 'ПИ-101', 'Очная', 'Бюджет', null, null, null, null, null, null, null, null, null),
    ('03-ОТЧ', DATE '2024-05-20', 'EXPULSION',
     'На основании устава Ульяновского государственного технического университета\n\nПРИКАЗЫВАЮ:\n\nСчитать отчисленными студентов по собственному желанию с 2024-05-25.\nОснование: заявление студента.',
     DATE '2024-05-22', 'Проректор по учебной работе', 'Н.Н. Андреев', 'Громов С.В.', null, null, 'заявление студента', '09.03.01 Информатика и вычислительная техника', 'ПИ-201', 'Очная', 'Бюджет', null, DATE '2024-05-25', 'нет', null, null, null, null, null, null),
    ('04-ПЕРН', DATE '2024-06-15', 'TRANSFER_DIRECTION',
     'ПРИКАЗЫВАЮ:\n\nПеревести студентов по их заявлению на другое направление и в другую группу.\nСтарое направление: 09.03.01 ИВТ, новая программа: 38.03.05 Бизнес-информатика.',
     DATE '2024-06-16', 'Декан ФИиАТ', 'Е.В. Кузнецова', 'Смирнова А.И.', null, null, 'заявление студента', '38.03.05 Бизнес-информатика', 'БИ-301', 'Очная', 'Бюджет', null, null, null, '09.03.01 ИВТ', 'ПИ-201', '38.03.05 Бизнес-информатика', 'БИ-301', 2, 2),
    ('05-ПЕРК', DATE '2024-06-30', 'TRANSFER_NEXT_COURSE',
     'ПРИКАЗЫВАЮ:\n\nПеревести студентов на следующий курс обучения. Предыдущий курс: 2, новый курс: 3.',
     DATE '2024-07-01', 'Декан ФИиАТ', 'Е.В. Кузнецова', 'Иванов П.С.', null, null, null, '09.03.01 ИВТ', 'ПИ-201', 'Очная', 'Бюджет', null, null, null, '09.03.01 ИВТ', 'ПИ-201', '09.03.01 ИВТ', 'ПИ-301', 2, 3),
    ('06-АКАД', DATE '2024-09-10', 'ACADEMIC_LEAVE',
     'ПРИКАЗЫВАЮ:\n\nОтправить в академический отпуск на основании медицинских документов.',
     DATE '2024-09-11', 'Декан ФРТ', 'Д.А. Николаев', 'Лапина И.А.', DATE '2024-09-15', DATE '2025-02-15', 'медицинское заключение', '11.03.04 Электроника и наноэлектроника', 'ЭН-301', 'Очная', 'Бюджет', null, null, null, null, null, null, null, null, null),
    ('07-ВКЛ', DATE '2024-09-20', 'ENROLLMENT',
     'ПРИКАЗЫВАЮ:\n\nЗачислить студентов на направление 45.03.02 Лингвистика. Форма обучения: очная. Основа обучения: договор.',
     DATE '2024-09-21', 'Декан ФГН', 'И.С. Орлова', 'Список первокурсников', null, null, 'приёмная комиссия', '45.03.02 Лингвистика', 'ЛИН-101', 'Очная', 'Договор', 'договор №2024/09/Л', null, 'договор', null, null, null, null, null, null)
ON CONFLICT (number) DO NOTHING;
