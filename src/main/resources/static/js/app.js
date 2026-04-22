(function () {
    const APP_ERROR_PAGE_PATH = '/error.html';
    const ERROR_TEXT_LIMIT = 2000;

    const clampErrorText = (value, maxLength = ERROR_TEXT_LIMIT) => {
        const text = String(value ?? '').trim();
        if (!text) return '';
        return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    };

    const normalizeError = (input) => {
        if (input instanceof Error) {
            const status = Number.isFinite(Number(input.status)) ? Number(input.status) : undefined;
            return {
                message: clampErrorText(input.message || 'Произошла непредвиденная ошибка.'),
                details: clampErrorText(input.stack || ''),
                status
            };
        }

        if (typeof input === 'string') {
            return {
                message: clampErrorText(input),
                details: '',
                status: undefined
            };
        }

        if (input && typeof input === 'object') {
            const status = Number.isFinite(Number(input.status)) ? Number(input.status) : undefined;
            let details = '';
            try {
                details = clampErrorText(JSON.stringify(input));
            } catch (e) {
                details = '';
            }
            return {
                message: clampErrorText(input.message || 'Произошла непредвиденная ошибка.'),
                details,
                status
            };
        }

        return {
            message: 'Произошла непредвиденная ошибка.',
            details: '',
            status: undefined
        };
    };

    const buildErrorHint = (status) => {
        if (!Number.isFinite(status)) {
            return 'Проверьте соединение с сервером и повторите попытку.';
        }
        if (status >= 500) {
            return 'Внутренняя ошибка сервера. Повторите действие позже или обратитесь к администратору.';
        }
        if (status === 404) {
            return 'Запрашиваемый ресурс не найден. Проверьте корректность данных и повторите попытку.';
        }
        if (status === 403) {
            return 'Доступ к операции ограничен. Проверьте права доступа.';
        }
        if (status === 401) {
            return 'Не удалось подтвердить доступ. Обновите страницу и повторите попытку.';
        }
        if (status >= 400) {
            return 'Проверьте введённые данные и повторите попытку.';
        }
        return 'Повторите действие позже.';
    };

    const isErrorPage = () => {
        const path = window.location.pathname || '';
        return path === APP_ERROR_PAGE_PATH || path.endsWith('/error.html');
    };

    const redirectToErrorPage = (input, options = {}) => {
        if (isErrorPage()) {
            return;
        }

        const normalized = normalizeError(input);
        const status = Number.isFinite(options.status) ? options.status : normalized.status;
        const message = clampErrorText(options.message || normalized.message || 'Произошла непредвиденная ошибка.', 800);
        const details = clampErrorText(options.details || normalized.details || '', 3000);
        const hint = clampErrorText(options.hint || buildErrorHint(status), 1200);

        const params = new URLSearchParams();
        params.set('message', message);
        if (hint) params.set('hint', hint);
        if (Number.isFinite(status)) params.set('status', String(status));
        if (details) params.set('details', details);
        if (options.source) params.set('source', clampErrorText(String(options.source), 80));

        window.location.assign(`${APP_ERROR_PAGE_PATH}?${params.toString()}`);
    };

    const shouldRedirectUnhandled = (error) => {
        const status = Number(error?.status);
        if (Number.isFinite(status)) {
            return status >= 500 || status === 0;
        }
        return true;
    };

    window.addEventListener('error', (event) => {
        const runtimeError = event?.error instanceof Error
            ? event.error
            : new Error(event?.message || 'Непредвиденная ошибка интерфейса.');
        redirectToErrorPage(runtimeError, {source: 'window.error'});
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event?.reason instanceof Error
            ? event.reason
            : new Error(typeof event?.reason === 'string' ? event.reason : 'Неперехваченная ошибка операции.');
        if (!shouldRedirectUnhandled(reason)) {
            return;
        }
        redirectToErrorPage(reason, {source: 'unhandledrejection'});
    });

    window.appErrorUtils = Object.freeze({
        redirectToErrorPage
    });

    const api = async (url, options = {}) => {
        const config = {
            headers: {'Content-Type': 'application/json'},
            ...options
        };
        let response;
        try {
            response = await fetch(url, config);
        } catch (networkError) {
            const error = networkError instanceof Error
                ? networkError
                : new Error('Не удалось выполнить запрос к серверу.');
            error.status = 0;
            redirectToErrorPage(error, {
                status: 0,
                source: 'api.network'
            });
            throw error;
        }
        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            let payload = null;
            let message = '';
            if (contentType.includes('application/json')) {
                try {
                    payload = await response.json();
                    if (payload && typeof payload.message === 'string') {
                        message = payload.message;
                    } else if (payload && typeof payload === 'object') {
                        message = Object.values(payload).join('; ');
                    } else {
                        message = JSON.stringify(payload);
                    }
                } catch (e) {
                    message = '';
                }
            } else {
                message = await response.text();
            }
            const error = new Error(message || `Ошибка ${response.status}`);
            error.status = response.status;
            error.payload = payload;
            if (response.status >= 500) {
                redirectToErrorPage(error, {
                    status: response.status,
                    source: 'api.response'
                });
            }
            throw error;
        }
        if (response.status === 204) {
            return null;
        }
        const contentType = response.headers.get('content-type') || '';
        return contentType.includes('application/json') ? response.json() : response.text();
    };

    const toast = (message, type = 'success') => {
        const wrapperId = 'appToastContainer';
        let container = document.getElementById(wrapperId);
        if (!container) {
            container = document.createElement('div');
            container.id = wrapperId;
            container.className = 'position-fixed top-0 end-0 p-3';
            container.style.zIndex = '5000';
            document.body.appendChild(container);
        }
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-bg-${type === 'success' ? 'dark' : 'danger'} border-0 show mb-2`;
        toastEl.role = 'alert';
        toastEl.innerHTML = `<div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>`;
        container.appendChild(toastEl);
        setTimeout(() => toastEl.remove(), 3500);
    };

    let confirmModalEl = null;
    let confirmModalTitleEl = null;
    let confirmModalMessageEl = null;
    let confirmModalSubmitEl = null;
    let confirmModalInstance = null;

    const ensureConfirmModal = () => {
        if (confirmModalEl) {
            return;
        }
        confirmModalEl = document.createElement('div');
        confirmModalEl.className = 'modal fade';
        confirmModalEl.id = 'appConfirmModal';
        confirmModalEl.tabIndex = -1;
        confirmModalEl.setAttribute('aria-hidden', 'true');
        confirmModalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header border-0">
                        <h2 class="modal-title h5" id="appConfirmModalTitle">Подтверждение</h2>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-0" id="appConfirmModalMessage">Подтвердите действие.</p>
                    </div>
                    <div class="modal-footer border-0">
                        <button type="button" class="btn btn-outline-dark" data-bs-dismiss="modal">Отмена</button>
                        <button type="button" class="btn btn-danger" id="appConfirmModalSubmit">Подтвердить</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModalEl);
        confirmModalTitleEl = document.getElementById('appConfirmModalTitle');
        confirmModalMessageEl = document.getElementById('appConfirmModalMessage');
        confirmModalSubmitEl = document.getElementById('appConfirmModalSubmit');
        confirmModalInstance = new bootstrap.Modal(confirmModalEl);
    };

    const confirmAction = ({title = 'Подтверждение', message = 'Подтвердите действие.', confirmText = 'Подтвердить', confirmClass = 'btn-danger'} = {}) => {
        ensureConfirmModal();
        return new Promise((resolve) => {
            let confirmed = false;

            confirmModalTitleEl.textContent = title;
            confirmModalMessageEl.textContent = message;
            confirmModalSubmitEl.textContent = confirmText;
            confirmModalSubmitEl.className = `btn ${confirmClass}`;

            const handleConfirm = () => {
                confirmed = true;
                confirmModalInstance.hide();
            };

            const handleHidden = () => {
                confirmModalSubmitEl.removeEventListener('click', handleConfirm);
                confirmModalEl.removeEventListener('hidden.bs.modal', handleHidden);
                resolve(confirmed);
            };

            confirmModalSubmitEl.addEventListener('click', handleConfirm);
            confirmModalEl.addEventListener('hidden.bs.modal', handleHidden);
            confirmModalInstance.show();
        });
    };

    const withButtonLoading = async (button, loadingText, action) => {
        if (!button || typeof action !== 'function') {
            if (typeof action === 'function') {
                return action();
            }
            return undefined;
        }
        if (button.dataset.loading === 'true') {
            return undefined;
        }
        const originalHtml = button.innerHTML;
        const originalDisabled = button.disabled;
        button.dataset.loading = 'true';
        button.disabled = true;
        button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${loadingText || 'Выполняется...'}`;
        try {
            return await action();
        } finally {
            button.innerHTML = originalHtml;
            button.disabled = originalDisabled;
            delete button.dataset.loading;
        }
    };

    const safeValue = (value) => value === undefined || value === null ? '' : value;
    const pickPreferredTransferGroup = (sourceGroup, targetGroups) => {
        if (!Array.isArray(targetGroups) || targetGroups.length === 0) {
            return null;
        }
        if (!sourceGroup) {
            return targetGroups[0];
        }
        const sameCourse = targetGroups.filter(group => Number(group.course) === Number(sourceGroup.course));
        const sameForm = sameCourse.filter(group => String(group.educationForm || '') === String(sourceGroup.educationForm || ''));
        const sameAccelerated = sameForm.filter(group => Boolean(group.accelerated) === Boolean(sourceGroup.accelerated));
        const sameNumber = sourceGroup.groupNumber == null
            ? []
            : sameAccelerated.filter(group => Number(group.groupNumber) === Number(sourceGroup.groupNumber));
        if (sameNumber.length > 0) return sameNumber[0];
        if (sameAccelerated.length > 0) return sameAccelerated[0];
        if (sameForm.length > 0) return sameForm[0];
        if (sameCourse.length > 0) return sameCourse[0];
        return targetGroups[0];
    };
    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const sanitizeMoneyRaw = (value) => {
        const raw = String(value ?? '').replace(/\u00A0/g, ' ').trim();
        if (!raw) return '';

        let normalized = raw
            .replace(/\s*руб\.?\s*(в\s*год)?\s*$/iu, '')
            .replace(/\s*рубл(ей|я|ь)?\s*(в\s*год)?\s*$/iu, '')
            .replace(/\s*в\s*год\s*$/iu, '')
            .replace(/\s+/g, '')
            .replace(',', '.')
            .replace(/[^\d.]/g, '');

        if (!normalized) return '';

        const dotIndex = normalized.indexOf('.');
        if (dotIndex >= 0) {
            normalized = normalized.slice(0, dotIndex + 1) + normalized.slice(dotIndex + 1).replace(/\./g, '');
        }
        if (normalized.startsWith('.')) {
            normalized = `0${normalized}`;
        }
        return normalized;
    };
    const parseMoneyParts = (value) => {
        const normalized = sanitizeMoneyRaw(value);
        if (!normalized) return null;

        let [integerPart = '', fractionPart = ''] = normalized.split('.');
        integerPart = integerPart.replace(/\D/g, '');
        if (!integerPart && !fractionPart) {
            return null;
        }

        integerPart = integerPart.replace(/^0+(?=\d)/, '');
        if (!integerPart) {
            integerPart = '0';
        }

        const fraction = fractionPart.replace(/\D/g, '').slice(0, 2).padEnd(2, '0');
        return {
            integerPart,
            fractionPart: fraction
        };
    };
    const parseMoneyPartsForTyping = (value) => {
        const normalized = sanitizeMoneyRaw(value);
        if (!normalized) return null;
        const hasFractionSeparator = normalized.includes('.');

        let [integerPart = '', fractionPart = ''] = normalized.split('.');
        integerPart = integerPart.replace(/\D/g, '');
        fractionPart = fractionPart.replace(/\D/g, '').slice(0, 2);
        if (!integerPart && !fractionPart) {
            return null;
        }

        integerPart = integerPart.replace(/^0+(?=\d)/, '');
        if (!integerPart) {
            integerPart = '0';
        }

        return {
            integerPart,
            fractionPart,
            hasFractionSeparator
        };
    };
    const formatMoneyInput = (value, options = {}) => {
        const parsed = parseMoneyParts(value);
        const emptyAsBlank = options.emptyAsBlank !== false;
        if (!parsed) {
            return emptyAsBlank ? '' : '0,00';
        }
        const groupedInteger = parsed.integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${groupedInteger},${parsed.fractionPart}`;
    };
    const formatMoneyInputForTyping = (value, options = {}) => {
        const parsed = parseMoneyPartsForTyping(value);
        const emptyAsBlank = options.emptyAsBlank !== false;
        if (!parsed) {
            return emptyAsBlank ? '' : '0';
        }
        const groupedInteger = parsed.integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        if (parsed.hasFractionSeparator || parsed.fractionPart) {
            return `${groupedInteger},${parsed.fractionPart}`;
        }
        return groupedInteger;
    };
    const normalizeMoneyForApi = (value) => {
        const parsed = parseMoneyParts(value);
        if (!parsed) return '';
        return `${parsed.integerPart}.${parsed.fractionPart}`;
    };
    const isZeroMoney = (value) => {
        const normalized = normalizeMoneyForApi(value);
        if (!normalized) return true;
        return Number(normalized) === 0;
    };
    const countDigitsInText = (value) => (String(value || '').match(/\d/g) || []).length;
    const findCaretByDigitCount = (formatted, digitsBeforeCaret) => {
        if (digitsBeforeCaret <= 0) {
            return 0;
        }
        let seenDigits = 0;
        const text = String(formatted || '');
        for (let index = 0; index < text.length; index += 1) {
            if (/\d/.test(text[index])) {
                seenDigits += 1;
            }
            if (seenDigits >= digitsBeforeCaret) {
                return index + 1;
            }
        }
        return text.length;
    };
    const applyMoneyMaskWithCaret = (input, options = {}) => {
        if (!input) return;
        const raw = input.value;
        const caretStart = typeof input.selectionStart === 'number' ? input.selectionStart : String(raw || '').length;
        const digitsBeforeCaret = countDigitsInText(String(raw || '').slice(0, caretStart));
        const separatorIndex = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
        const editingIntegerPart = separatorIndex < 0 || caretStart <= separatorIndex;
        const formatter = typeof options.formatter === 'function'
            ? options.formatter
            : (value) => formatMoneyInput(value, options);
        const formatted = formatter(raw, options);
        input.value = formatted;
        let newCaret = findCaretByDigitCount(formatted, digitsBeforeCaret);
        if (editingIntegerPart) {
            const formattedSeparatorIndex = formatted.indexOf(',');
            if (formattedSeparatorIndex >= 0 && newCaret > formattedSeparatorIndex) {
                newCaret = formattedSeparatorIndex;
            }
        }
        try {
            input.setSelectionRange(newCaret, newCaret);
        } catch (ignored) {
            // ignore for non-focusable states
        }
    };
    const FACULTY_PREFIX = 'Факультет';
    const stripFacultyPrefix = (value) => String(value || '')
        .replace(/^\s*факультет\s+/iu, '')
        .replace(/\s+/g, ' ')
        .trim();
    const formatFacultyName = (value) => {
        const normalized = stripFacultyPrefix(value);
        return normalized ? `${FACULTY_PREFIX} ${normalized}` : '';
    };
    const mapFacultyForDisplay = (faculties) => (Array.isArray(faculties) ? faculties : []).map((faculty) => ({
        ...faculty,
        name: stripFacultyPrefix(faculty?.name),
        displayName: formatFacultyName(faculty?.name)
    }));
    const extractValidationMessage = (error, fieldName) => {
        if (error?.payload && typeof error.payload === 'object' && fieldName && typeof error.payload[fieldName] === 'string') {
            return error.payload[fieldName];
        }
        return error?.message || 'Не удалось сохранить данные.';
    };
    const DUPLICATE_STUDENT_DOC_MESSAGE = 'Студент с таким номером зачётки или договора существует.';
    const isDuplicateStudentDocError = (error) => {
        const payloadText = error?.payload && typeof error.payload === 'object'
            ? JSON.stringify(error.payload)
            : '';
        const normalized = `${error?.message || ''} ${payloadText}`.toLowerCase();
        return [
            'duplicate key value violates unique constraint',
            'unique constraint',
            'record_book',
            'study_contract_number',
            'uk_3s3di2tnfdi74uqxol46pjpyo',
            'uq_students_record_book_seed',
            'uq_students_contract_seed',
            'номер зачётной книжки уже используется',
            'номер договора уже используется'
        ].some((token) => normalized.includes(token));
    };
    const FACULTY_NAME_ALLOWED_PATTERN = /^[A-Za-zА-Яа-яЁё\-\s]+$/u;
    const FACULTY_ABBREVIATION_SKIP_WORDS = new Set([
        'и', 'в', 'во', 'на', 'по', 'для', 'с', 'со', 'о', 'об', 'от', 'к', 'ко', 'у', 'из'
    ]);
    const normalizeFacultyShortName = (value) => String(value || '')
        .replace(/\s+/g, '')
        .toUpperCase();
    const buildFacultyAbbreviation = (value) => {
        const normalizedName = stripFacultyPrefix(value);
        if (!normalizedName) {
            return '';
        }
        const words = normalizedName.split(/\s+/).filter(Boolean);
        let abbreviation = 'Ф';
        words.forEach((word, index) => {
            const lettersOnly = String(word || '').replace(/[^\p{L}]/gu, '');
            if (!lettersOnly) {
                return;
            }
            const lowerWord = lettersOnly.toLowerCase();
            if (index > 0 && FACULTY_ABBREVIATION_SKIP_WORDS.has(lowerWord)) {
                return;
            }
            abbreviation += lettersOnly.charAt(0).toUpperCase();
        });
        if (abbreviation.length === 1) {
            const firstLetter = normalizedName.match(/\p{L}/u);
            if (firstLetter) {
                abbreviation += firstLetter[0].toUpperCase();
            }
        }
        return abbreviation;
    };
    const setFacultyShortNameManualFlag = (nameInput, shortNameInput) => {
        if (!nameInput || !shortNameInput) return;
        const normalizedShortName = normalizeFacultyShortName(shortNameInput.value);
        if (!normalizedShortName) {
            shortNameInput.dataset.shortNameManual = 'false';
            shortNameInput.value = buildFacultyAbbreviation(nameInput.value);
            return;
        }
        shortNameInput.value = normalizedShortName;
        const autoValue = buildFacultyAbbreviation(nameInput.value);
        shortNameInput.dataset.shortNameManual = normalizedShortName !== autoValue ? 'true' : 'false';
    };
    const applyFacultyShortNameAuto = (nameInput, shortNameInput, force = false) => {
        if (!nameInput || !shortNameInput) return;
        if (!force && shortNameInput.dataset.shortNameManual === 'true') {
            return;
        }
        shortNameInput.value = buildFacultyAbbreviation(nameInput.value);
        shortNameInput.dataset.shortNameManual = 'false';
    };
    const DIRECTION_ABBREVIATION_SKIP_WORDS = new Set([
        'и', 'в', 'во', 'на', 'по', 'для', 'с', 'со', 'о', 'об', 'от', 'к', 'ко', 'у', 'из'
    ]);
    const normalizeDirectionShortName = (value) => String(value || '')
        .replace(/\s+/g, '')
        .toUpperCase()
        .replace(/[^\p{L}\p{N}\-]/gu, '')
        .slice(0, 16);
    const buildDirectionAbbreviation = (value) => {
        const normalizedName = normalizeDirectionName(value);
        if (!normalizedName) {
            return '';
        }
        const words = normalizedName.split(/\s+/).filter(Boolean);
        let abbreviation = '';
        words.forEach((word, index) => {
            const lettersOnly = String(word || '').replace(/[^\p{L}]/gu, '');
            if (!lettersOnly) {
                return;
            }
            const lowerWord = lettersOnly.toLowerCase();
            if (index > 0 && DIRECTION_ABBREVIATION_SKIP_WORDS.has(lowerWord)) {
                return;
            }
            abbreviation += lettersOnly.charAt(0).toUpperCase();
        });
        if (!abbreviation) {
            const firstLetter = normalizedName.match(/\p{L}/u);
            if (firstLetter) {
                abbreviation = firstLetter[0].toUpperCase();
            }
        }
        return abbreviation.slice(0, 16);
    };
    const setDirectionShortNameManualFlag = (nameInput, shortNameInput) => {
        if (!nameInput || !shortNameInput) return;
        const normalizedShortName = normalizeDirectionShortName(shortNameInput.value);
        if (!normalizedShortName) {
            shortNameInput.dataset.shortNameManual = 'false';
            shortNameInput.value = buildDirectionAbbreviation(nameInput.value);
            return;
        }
        shortNameInput.value = normalizedShortName;
        const autoValue = buildDirectionAbbreviation(nameInput.value);
        shortNameInput.dataset.shortNameManual = normalizedShortName !== autoValue ? 'true' : 'false';
    };
    const applyDirectionShortNameAuto = (nameInput, shortNameInput, force = false) => {
        if (!nameInput || !shortNameInput) return;
        if (!force && shortNameInput.dataset.shortNameManual === 'true') {
            return;
        }
        shortNameInput.value = buildDirectionAbbreviation(nameInput.value);
        shortNameInput.dataset.shortNameManual = 'false';
    };
    const isRepeatingSingleSymbol = (value) => {
        const compact = String(value || '').replace(/\s+/g, '').toLowerCase();
        if (compact.length < 3) return false;
        return compact.split('').every((ch) => ch === compact[0]);
    };
    const validateFacultyName = (value) => {
        const normalized = stripFacultyPrefix(value);
        if (!normalized) {
            return 'Укажите название факультета без слова «Факультет».';
        }
        if (normalized.length < 6 || normalized.length > 80) {
            return 'Название факультета должно быть от 6 до 80 символов.';
        }
        if (!FACULTY_NAME_ALLOWED_PATTERN.test(normalized)) {
            return 'Название факультета выглядит некорректно.';
        }
        if (isRepeatingSingleSymbol(normalized)) {
            return 'Название факультета выглядит некорректно.';
        }
        return '';
    };
    const getFacultyValidationReason = (inputEl) => {
        const normalized = stripFacultyPrefix(inputEl?.value || '');
        const semanticReason = validateFacultyName(normalized);
        if (semanticReason) {
            return semanticReason;
        }
        if (!inputEl) {
            return 'Некорректное название факультета.';
        }
        if (inputEl.validity?.valueMissing) {
            return 'Укажите название факультета.';
        }
        if (inputEl.validity?.tooShort || inputEl.validity?.tooLong) {
            return 'Название факультета должно быть от 6 до 80 символов.';
        }
        if (inputEl.validity?.patternMismatch) {
            return 'Название факультета выглядит некорректно.';
        }
        return inputEl.validationMessage || 'Некорректное название факультета.';
    };
    const normalizeDirectionName = (value) => String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    const validateDirectionName = (value) => {
        const normalized = normalizeDirectionName(value);
        if (!normalized) {
            return 'Укажите название направления.';
        }
        if (normalized.length < 6 || normalized.length > 80) {
            return 'Название направления должно быть от 6 до 80 символов.';
        }
        if (!FACULTY_NAME_ALLOWED_PATTERN.test(normalized)) {
            return 'Название направления выглядит некорректно.';
        }
        if (isRepeatingSingleSymbol(normalized)) {
            return 'Название направления выглядит некорректно.';
        }
        return '';
    };
    const getDirectionValidationReason = (inputEl) => {
        const normalized = normalizeDirectionName(inputEl?.value || '');
        const semanticReason = validateDirectionName(normalized);
        if (semanticReason) {
            return semanticReason;
        }
        if (!inputEl) {
            return 'Некорректное название направления.';
        }
        if (inputEl.validity?.valueMissing) {
            return 'Укажите название направления.';
        }
        if (inputEl.validity?.tooShort || inputEl.validity?.tooLong) {
            return 'Название направления должно быть от 6 до 80 символов.';
        }
        if (inputEl.validity?.patternMismatch) {
            return 'Название направления выглядит некорректно.';
        }
        return inputEl.validationMessage || 'Некорректное название направления.';
    };
    const STUDENT_PERSON_NAME_ALLOWED_PATTERN = /^[A-Za-zА-Яа-яЁё\-]+$/u;
    const normalizeStudentPersonName = (value) => String(value || '').trim();
    const STUDENT_PERSON_NAME_RULES = {
        'Фамилия': {
            required: 'Укажите фамилию.',
            length: 'Фамилия должна быть длиной от 2 до 64 символов.',
            invalid: 'Фамилия выглядит некорректно.'
        },
        'Имя': {
            required: 'Укажите имя.',
            length: 'Имя должно быть длиной от 2 до 64 символов.',
            invalid: 'Имя выглядит некорректно.'
        },
        'Отчество': {
            required: 'Укажите отчество.',
            length: 'Отчество должно быть длиной от 2 до 64 символов.',
            invalid: 'Отчество выглядит некорректно.'
        }
    };
    const getStudentPersonNameRules = (fieldLabel) => STUDENT_PERSON_NAME_RULES[fieldLabel] || {
        required: `Укажите ${fieldLabel.toLowerCase()}.`,
        length: `${fieldLabel} должно быть длиной от 2 до 64 символов.`,
        invalid: `${fieldLabel} выглядит некорректно.`
    };
    const validateStudentPersonName = (value, fieldLabel, required = true) => {
        const normalized = normalizeStudentPersonName(value);
        const messages = getStudentPersonNameRules(fieldLabel);
        if (!normalized) {
            return required ? messages.required : '';
        }
        if (normalized.length < 2 || normalized.length > 64) {
            return messages.length;
        }
        if (!STUDENT_PERSON_NAME_ALLOWED_PATTERN.test(normalized)) {
            return messages.invalid;
        }
        if (isRepeatingSingleSymbol(normalized)) {
            return messages.invalid;
        }
        return '';
    };
    const ORDER_TYPE_LABELS = {
        ACADEMIC_LEAVE: 'Академический отпуск',
        ENROLLMENT: 'Зачисление',
        EXPULSION: 'Отчисление',
        TRANSFER_DIRECTION: 'Перевод направления',
        TRANSFER_NEXT_COURSE: 'Перевод на курс'
    };
    const ORDER_TYPE_FORM_TITLES = {
        ACADEMIC_LEAVE: 'Приказ на академ',
        ENROLLMENT: 'Приказ на зачисление',
        EXPULSION: 'Приказ на отчисление',
        TRANSFER_DIRECTION: 'Приказ на перевод на направление',
        TRANSFER_NEXT_COURSE: 'Приказ на перевод на курс'
    };
    const STUDENT_STATUS_LABELS = {
        NEW: 'Новый',
        ACTIVE: 'Обучается',
        ACADEMIC_LEAVE: 'Академ',
        EXPELLED: 'Отчислен',
        GRADUATED: 'Выпустился'
    };
    const getOrderTypeLabel = (type) => ORDER_TYPE_LABELS[type] || type;
    const getOrderFormTitle = (type) => ORDER_TYPE_FORM_TITLES[type] || 'Приказ';
    const getStudentStatusLabel = (status) => STUDENT_STATUS_LABELS[status] || status;

    const buildVisiblePages = (page, totalPages) => {
        if (totalPages <= 0) return [];
        const pageIndexes = new Set();
        for (let i = 0; i < Math.min(3, totalPages); i += 1) {
            pageIndexes.add(i);
        }
        for (let i = Math.max(totalPages - 3, 0); i < totalPages; i += 1) {
            pageIndexes.add(i);
        }
        for (let i = page - 1; i <= page + 1; i += 1) {
            if (i >= 0 && i < totalPages) {
                pageIndexes.add(i);
            }
        }
        return Array.from(pageIndexes).sort((a, b) => a - b);
    };

    const renderPaginationControls = ({
        page,
        totalPages,
        firstBtn,
        prevBtn,
        numbersEl,
        nextBtn,
        lastBtn
    }) => {
        if (!numbersEl || !firstBtn || !prevBtn || !nextBtn || !lastBtn) {
            return;
        }

        if (!totalPages) {
            numbersEl.innerHTML = `<button class="btn btn-outline-dark btn-sm px-2" type="button" disabled>1</button>`;
            firstBtn.disabled = true;
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            lastBtn.disabled = true;
            return;
        }

        const visiblePages = buildVisiblePages(page, totalPages);
        const pageItems = [];
        let previous = -1;
        visiblePages.forEach((pageIndex) => {
            if (previous >= 0 && pageIndex - previous > 1) {
                pageItems.push('<span class="px-1 text-muted">...</span>');
            }
            const activeClass = pageIndex === page ? 'btn-dark' : 'btn-outline-dark';
            pageItems.push(
                `<button class="btn ${activeClass} btn-sm px-2" type="button" data-page-index="${pageIndex}">${pageIndex + 1}</button>`
            );
            previous = pageIndex;
        });
        numbersEl.innerHTML = pageItems.join('');

        firstBtn.disabled = page <= 0;
        prevBtn.disabled = page <= 0;
        nextBtn.disabled = page >= totalPages - 1;
        lastBtn.disabled = page >= totalPages - 1;
    };

    const paginateLocal = (items, currentPage, pageSize) => {
        const totalItems = items.length;
        const safeSize = pageSize > 0 ? pageSize : 10;
        const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / safeSize);
        const safePage = totalPages === 0 ? 0 : Math.min(Math.max(currentPage, 0), totalPages - 1);
        const start = safePage * safeSize;
        return {
            page: safePage,
            totalPages,
            content: items.slice(start, start + safeSize)
        };
    };

    const toIsoDate = (year, month, day) => {
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
            return undefined;
        }
        return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    const parseDateInputToIso = (raw) => {
        const value = String(raw || '').trim();
        if (!value) return null;

        let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
        }

        match = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
        if (match) {
            return toIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
        }

        return undefined;
    };

    const applyRuDateMask = (rawValue) => {
        const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 8);
        if (!digits) return '';
        if (digits.length <= 2) {
            return digits;
        }
        if (digits.length <= 4) {
            return `${digits.slice(0, 2)}.${digits.slice(2)}`;
        }
        return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    };

    const formatIsoDateToRu = (isoDate) => {
        const value = String(isoDate || '').trim();
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return '';
        return `${match[3]}.${match[2]}.${match[1]}`;
    };

    const bindTextDatePicker = (textInput, pickerButton) => {
        if (!textInput || !pickerButton) return;

        textInput.setAttribute('inputmode', 'numeric');
        textInput.setAttribute('maxlength', '10');

        const hiddenPicker = document.createElement('input');
        hiddenPicker.type = 'date';
        hiddenPicker.max = '9999-12-31';
        hiddenPicker.tabIndex = -1;
        hiddenPicker.setAttribute('aria-hidden', 'true');
        hiddenPicker.style.position = 'absolute';
        hiddenPicker.style.opacity = '0';
        hiddenPicker.style.pointerEvents = 'none';
        hiddenPicker.style.width = '0';
        hiddenPicker.style.height = '0';
        hiddenPicker.style.padding = '0';
        hiddenPicker.style.border = '0';
        textInput.parentElement.appendChild(hiddenPicker);

        const syncHiddenValueFromText = () => {
            const iso = parseDateInputToIso(textInput.value);
            hiddenPicker.value = iso || '';
        };

        const syncMaskedValue = () => {
            textInput.value = applyRuDateMask(textInput.value);
            textInput.setCustomValidity('');
        };

        textInput.addEventListener('input', syncMaskedValue);
        textInput.addEventListener('paste', (event) => {
            const pasted = String(event.clipboardData?.getData('text') || '').trim();
            if (!pasted) return;
            const iso = parseDateInputToIso(pasted);
            if (iso === undefined) {
                event.preventDefault();
                textInput.setCustomValidity('Вставьте корректную дату в формате дд.мм.гггг');
                if (typeof textInput.reportValidity === 'function') {
                    textInput.reportValidity();
                }
                return;
            }
            event.preventDefault();
            textInput.value = iso ? formatIsoDateToRu(iso) : '';
            hiddenPicker.value = iso || '';
            textInput.setCustomValidity('');
            textInput.dispatchEvent(new Event('change', {bubbles: true}));
        });

        pickerButton.addEventListener('click', () => {
            syncHiddenValueFromText();
            if (typeof hiddenPicker.showPicker === 'function') {
                hiddenPicker.showPicker();
            } else {
                hiddenPicker.click();
            }
        });

        hiddenPicker.addEventListener('change', () => {
            textInput.value = formatIsoDateToRu(hiddenPicker.value);
            textInput.dispatchEvent(new Event('change', {bubbles: true}));
        });

        textInput.addEventListener('blur', () => {
            const iso = parseDateInputToIso(textInput.value);
            if (iso === undefined) {
                textInput.setCustomValidity('Дата должна быть в формате дд.мм.гггг');
                return;
            }
            textInput.value = iso ? formatIsoDateToRu(iso) : '';
            hiddenPicker.value = iso || '';
            textInput.setCustomValidity('');
        });
    };

    const enforceNativeDateYearLimit = (input) => {
        if (!input || input.type !== 'date') return;
        const value = String(input.value || '').trim();
        if (!value) {
            input.setCustomValidity('');
            return;
        }
        const match = value.match(/^(\d+)-(\d{2})-(\d{2})$/);
        if (!match || match[1].length !== 4) {
            input.setCustomValidity('Год должен содержать 4 цифры');
            return;
        }
        const iso = toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
        if (!iso) {
            input.setCustomValidity('Укажите корректную дату');
            return;
        }
        input.setCustomValidity('');
    };

    const bindStrictDateInputs = (root = document) => {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        root.querySelectorAll('input[type="date"]').forEach((input) => {
            if (input.dataset.strictDateBound === 'true') return;
            input.dataset.strictDateBound = 'true';
            if (!input.max) {
                input.max = '9999-12-31';
            }
            const handler = () => enforceNativeDateYearLimit(input);
            input.addEventListener('input', handler);
            input.addEventListener('change', handler);
            input.addEventListener('blur', handler);
            input.addEventListener('paste', (event) => {
                const pasted = String(event.clipboardData?.getData('text') || '').trim();
                if (!pasted) return;
                const iso = parseDateInputToIso(pasted);
                if (iso === undefined) {
                    event.preventDefault();
                    input.setCustomValidity('Вставьте корректную дату');
                    if (typeof input.reportValidity === 'function') {
                        input.reportValidity();
                    }
                    return;
                }
                event.preventDefault();
                input.value = iso || '';
                input.setCustomValidity('');
                input.dispatchEvent(new Event('change', {bubbles: true}));
            });
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        bindStrictDateInputs(document);
        initStudentsPage();
        initGroupsPage();
        initDirectionsPage();
        initFacultiesPage();
        initCurriculumsPage();
        initOrdersPage();
        initOrderFormPage();
        initReportsPage();
    });

    // ===== Студенты =====
    function initStudentsPage() {
        const page = document.getElementById('studentsPage');
        if (!page) return;

        const studentTableBody = document.getElementById('studentTableBody');
        const studentsCount = document.getElementById('studentsCount');
        const filterFaculty = document.getElementById('filterFaculty');
        const filterDirection = document.getElementById('filterDirection');
        const filterGroup = document.getElementById('filterGroup');
        const filterEducationLevel = document.getElementById('filterEducationLevel');
        const filterCourse = document.getElementById('filterCourse');
        const filterEducationForm = document.getElementById('filterEducationForm');
        const filterAccelerated = document.getElementById('filterAccelerated');
        const filterStatus = document.getElementById('filterStatus');
        const filterSort = document.getElementById('filterSort');
        const filterSortDirection = document.getElementById('filterSortDirection');
        const filterSearch = document.getElementById('filterSearch');
        const reloadBtn = document.getElementById('reloadStudents');
        const resetBtn = document.getElementById('resetStudentFilters');
        const applyBtn = document.getElementById('applyStudentFilters');
        const pageSizeSelect = document.getElementById('pageSize');
        const pageFirst = document.getElementById('pageFirst');
        const pagePrev = document.getElementById('pagePrev');
        const pageNumbers = document.getElementById('pageNumbers');
        const pageNext = document.getElementById('pageNext');
        const pageLast = document.getElementById('pageLast');
        const studentModalEl = document.getElementById('studentModal');
        const studentFormEl = document.getElementById('studentForm');
        const studentIdEl = document.getElementById('studentId');
        const studentLastNameEl = document.getElementById('lastName');
        const studentFirstNameEl = document.getElementById('firstName');
        const studentMiddleNameEl = document.getElementById('middleName');
        const studentLastNameFeedback = document.getElementById('lastNameFeedback');
        const studentFirstNameFeedback = document.getElementById('firstNameFeedback');
        const studentMiddleNameFeedback = document.getElementById('middleNameFeedback');
        const studentFacultyEl = document.getElementById('studentFaculty');
        const studentDirectionEl = document.getElementById('studentDirection');
        const studentGroupSearchEl = document.getElementById('studentGroupSearch');
        const studentGroupSuggestionsEl = document.getElementById('studentGroupSuggestions');
        const studentGroupEl = document.getElementById('studentGroup');
        const studentEducationLevelEl = document.getElementById('studentEducationLevel');
        const studentCourseEl = document.getElementById('course');
        const studentStatusEl = document.getElementById('status');
        const studentEducationFormEl = document.getElementById('educationForm');
        const studentEducationBaseEl = document.getElementById('educationBase');
        const studentHasAcademicDebtsEl = document.getElementById('hasAcademicDebts');
        const studentRecordBookEl = document.getElementById('recordBook');
        const studentContractNumberEl = document.getElementById('studyContractNumber');
        const studentPhoneEl = document.getElementById('phone');
        const studentEmailEl = document.getElementById('email');
        const studentBirthDateEl = document.getElementById('birthDate');
        const studentStudyStartDateEl = document.getElementById('studyStartDate');

        let currentPage = 0;
        let lastTotalPages = 1;

        let faculties = [];
        let directions = [];
        let groups = [];
        let modalGroups = [];
        let currentStudentGroupOptions = [];

        const STUDENT_FORM_TO_GROUP_FORM = {
            'Очная': 'FULL_TIME',
            'Очно-заочная': 'PART_TIME',
            'Заочная': 'DISTANCE'
        };
        const GROUP_FORM_TO_STUDENT_FORM = {
            FULL_TIME: 'Очная',
            PART_TIME: 'Очно-заочная',
            DISTANCE: 'Заочная'
        };
        const STUDENT_FILTER_LEVEL_ORDER = ['BACHELOR', 'SPECIALIST', 'MASTER'];
        const STUDENT_FILTER_LEVEL_LABELS = {
            BACHELOR: 'Бакалавр',
            SPECIALIST: 'Специалитет',
            MASTER: 'Магистратура'
        };
        const STUDENT_FILTER_FORM_ORDER = ['FULL_TIME', 'PART_TIME', 'DISTANCE'];
        const STUDENT_FILTER_FORM_LABELS = {
            FULL_TIME: 'Очная',
            PART_TIME: 'Очно-заочная',
            DISTANCE: 'Заочная'
        };
        const STUDENT_MAX_COURSE_BY_LEVEL = {
            BACHELOR: 4,
            SPECIALIST: 5,
            MASTER: 2
        };

        const syncStudyStartDateRequiredState = () => {
            const isNewStatus = String(studentStatusEl?.value || '') === 'NEW';
            if (studentStudyStartDateEl) {
                studentStudyStartDateEl.required = !isNewStatus;
                if (isNewStatus) {
                    studentStudyStartDateEl.setCustomValidity('');
                }
            }
            const hintEl = document.getElementById('studyStartDateOptionalHint');
            if (hintEl) {
                hintEl.textContent = isNewStatus
                    ? '(необязательно для статуса «Новый»)'
                    : '(обязательно)';
            }
        };

        const getGroupFormByStudentForm = (studentEducationForm) => STUDENT_FORM_TO_GROUP_FORM[studentEducationForm] || '';
        const getStudentFormByGroupForm = (groupEducationForm) => GROUP_FORM_TO_STUDENT_FORM[groupEducationForm] || 'Очная';

        const getAdmissionDateValue = () => {
            return studentStudyStartDateEl.value || '';
        };

        const getAdmissionYearTwoDigits = () => {
            const dateValue = getAdmissionDateValue();
            if (!dateValue || dateValue.length < 4) return '';
            return dateValue.slice(2, 4);
        };

        const getStudentAdmissionYearTwoDigits = (student) => {
            const dateValue = String(student?.studyStartDate || '');
            if (!dateValue || dateValue.length < 4) return '';
            return dateValue.slice(2, 4);
        };

        const formatStudentRecordBookForDisplay = (student) => {
            const raw = String(student?.recordBook || '').trim();
            if (!raw) {
                return '';
            }
            if (/^\d{2}\/\d{3}$/.test(raw)) {
                return raw;
            }
            const digits = raw.replace(/\D/g, '');
            if (!digits) {
                return raw;
            }
            const yearPrefix = getStudentAdmissionYearTwoDigits(student);
            const suffix = digits.slice(-3).padStart(3, '0');
            return yearPrefix ? `${yearPrefix}/${suffix}` : raw;
        };

        const getAdmissionYearFull = () => {
            const dateValue = getAdmissionDateValue();
            if (!dateValue || dateValue.length < 4) return '';
            return dateValue.slice(0, 4);
        };

        const applyPhoneMask = () => {
            if (!studentPhoneEl) return;
            let digits = String(studentPhoneEl.value || '').replace(/\D/g, '');
            if (!digits) {
                studentPhoneEl.value = '';
                return;
            }
            if (digits.startsWith('8')) {
                digits = '7' + digits.slice(1);
            } else if (!digits.startsWith('7')) {
                digits = '7' + digits;
            }
            digits = digits.slice(0, 11);

            let formatted = '+7';
            if (digits.length > 1) {
                formatted += ` (${digits.slice(1, 4)}`;
            }
            if (digits.length >= 4) {
                formatted += ')';
            }
            if (digits.length > 4) {
                formatted += ` ${digits.slice(4, 7)}`;
            }
            if (digits.length > 7) {
                formatted += `-${digits.slice(7, 9)}`;
            }
            if (digits.length > 9) {
                formatted += `-${digits.slice(9, 11)}`;
            }
            studentPhoneEl.value = formatted;
        };

        const applyEmailMask = () => {
            if (!studentEmailEl) return;
            studentEmailEl.value = String(studentEmailEl.value || '')
                .replace(/\s+/g, '')
                .toLowerCase();
        };

        const applyRecordBookMask = () => {
            if (!studentRecordBookEl) return;
            const prefix = getAdmissionYearTwoDigits();
            const currentValue = String(studentRecordBookEl.value || '');
            if (!prefix) {
                const digits = currentValue.replace(/\D/g, '').slice(0, 5);
                if (!digits) {
                    studentRecordBookEl.value = '';
                    return;
                }
                if (digits.length <= 2) {
                    studentRecordBookEl.value = digits;
                    return;
                }
                studentRecordBookEl.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                return;
            }

            let suffixDigits = '';

            if (currentValue.includes('/')) {
                suffixDigits = currentValue.slice(currentValue.lastIndexOf('/') + 1).replace(/\D/g, '');
            } else {
                const digits = currentValue.replace(/\D/g, '');
                if (prefix && digits.startsWith(prefix)) {
                    suffixDigits = digits.slice(prefix.length);
                } else if (prefix && digits.length > 3) {
                    suffixDigits = digits.slice(-3);
                } else {
                    suffixDigits = digits;
                }
            }
            suffixDigits = suffixDigits.slice(0, 3);
            studentRecordBookEl.value = prefix ? `${prefix}/${suffixDigits}` : suffixDigits;
        };

        const applyContractNumberMask = () => {
            if (!studentContractNumberEl) return;
            const prefix = getAdmissionYearFull();
            const currentValue = String(studentContractNumberEl.value || '');
            if (!prefix) {
                const digits = currentValue.replace(/\D/g, '').slice(0, 7);
                if (!digits) {
                    studentContractNumberEl.value = '';
                    return;
                }
                if (digits.length <= 4) {
                    studentContractNumberEl.value = digits;
                    return;
                }
                studentContractNumberEl.value = `${digits.slice(0, 4)}-З-${digits.slice(4)}`;
                return;
            }

            let suffixDigits = '';

            if (currentValue.includes('-З-')) {
                suffixDigits = currentValue.slice(currentValue.lastIndexOf('-З-') + 3).replace(/\D/g, '');
            } else {
                const digits = currentValue.replace(/\D/g, '');
                if (prefix && digits.startsWith(prefix)) {
                    suffixDigits = digits.slice(prefix.length);
                } else if (prefix && digits.length > 3) {
                    suffixDigits = digits.slice(-3);
                } else {
                    suffixDigits = digits;
                }
            }
            suffixDigits = suffixDigits.slice(0, 3);
            studentContractNumberEl.value = prefix ? `${prefix}-З-${suffixDigits}` : suffixDigits;
        };

        const loadFaculties = async () => {
            faculties = mapFacultyForDisplay(await api('/api/faculties'));
            renderSelect(filterFaculty, faculties, 'Все');
            renderSelect(studentFacultyEl, faculties, 'Выберите факультет');
        };

        const loadDirections = async (facultyId, {renderFilter = true, renderModal = true} = {}) => {
            const url = facultyId ? `/api/directions?facultyId=${facultyId}` : '/api/directions';
            directions = await api(url);
            if (renderFilter) {
                renderSelect(filterDirection, directions, 'Все');
            }
            if (renderModal) {
                renderSelect(studentDirectionEl, directions, 'Выберите направление');
            }
        };

        const loadGroups = async (directionId, {renderFilter = true} = {}) => {
            const url = directionId ? `/api/groups?directionId=${directionId}` : '/api/groups';
            groups = await api(url);
            if (renderFilter) {
                renderSelect(filterGroup, groups, 'Все');
            }
        };

        const renderSimpleFilterSelect = (selectEl, values, labelsMap = null, placeholder = 'Все') => {
            if (!selectEl) return;
            const previousValue = selectEl.value;
            const options = [`<option value="">${placeholder}</option>`].concat(
                values.map(value => {
                    const normalized = String(value);
                    const label = labelsMap && labelsMap[normalized] ? labelsMap[normalized] : normalized;
                    return `<option value="${normalized}">${label}</option>`;
                })
            );
            selectEl.innerHTML = options.join('');
            if (previousValue && Array.from(selectEl.options).some(option => option.value === String(previousValue))) {
                selectEl.value = String(previousValue);
            } else {
                selectEl.value = '';
            }
        };

        const getGroupsForStudentFilters = () => {
            const selectedFacultyId = filterFaculty.value ? String(filterFaculty.value) : '';
            const selectedDirectionId = filterDirection.value ? String(filterDirection.value) : '';
            const acceleratedOnly = Boolean(filterAccelerated?.checked);
            return (groups || []).filter(group => {
                if (selectedFacultyId && String(group.facultyId || '') !== selectedFacultyId) {
                    return false;
                }
                if (selectedDirectionId && String(group.directionId || '') !== selectedDirectionId) {
                    return false;
                }
                if (acceleratedOnly && !Boolean(group.accelerated)) {
                    return false;
                }
                return true;
            });
        };

        const syncStudentsFilterDependencies = () => {
            if (!filterEducationLevel || !filterCourse || !filterEducationForm) {
                return;
            }
            const baseGroups = getGroupsForStudentFilters();

            const syncOnePass = () => {
                const selectedLevel = String(filterEducationLevel.value || '');
                const selectedCourse = filterCourse.value ? Number(filterCourse.value) : null;
                const selectedForm = String(filterEducationForm.value || '');

                const availableLevels = Array.from(new Set(
                    baseGroups
                        .filter(group => {
                            if (selectedCourse != null && Number(group.course) !== selectedCourse) {
                                return false;
                            }
                            if (selectedForm && String(group.educationForm || '') !== selectedForm) {
                                return false;
                            }
                            return true;
                        })
                        .map(group => String(group.educationLevel || ''))
                        .filter(Boolean)
                )).sort((left, right) => {
                    const leftIndex = STUDENT_FILTER_LEVEL_ORDER.indexOf(left);
                    const rightIndex = STUDENT_FILTER_LEVEL_ORDER.indexOf(right);
                    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
                    if (leftIndex === -1) return 1;
                    if (rightIndex === -1) return -1;
                    return leftIndex - rightIndex;
                });
                renderSimpleFilterSelect(filterEducationLevel, availableLevels, STUDENT_FILTER_LEVEL_LABELS, 'Все');

                const effectiveLevel = String(filterEducationLevel.value || '');
                const availableCourses = Array.from(new Set(
                    baseGroups
                        .filter(group => {
                            if (effectiveLevel && String(group.educationLevel || '') !== effectiveLevel) {
                                return false;
                            }
                            if (selectedForm && String(group.educationForm || '') !== selectedForm) {
                                return false;
                            }
                            return true;
                        })
                        .map(group => Number(group.course))
                        .filter(course => Number.isFinite(course))
                )).sort((left, right) => left - right);
                renderSimpleFilterSelect(filterCourse, availableCourses.map(String), null, 'Все');

                const effectiveCourse = filterCourse.value ? Number(filterCourse.value) : null;
                const availableForms = Array.from(new Set(
                    baseGroups
                        .filter(group => {
                            if (effectiveLevel && String(group.educationLevel || '') !== effectiveLevel) {
                                return false;
                            }
                            if (effectiveCourse != null && Number(group.course) !== effectiveCourse) {
                                return false;
                            }
                            return true;
                        })
                        .map(group => String(group.educationForm || ''))
                        .filter(Boolean)
                )).sort((left, right) => {
                    const leftIndex = STUDENT_FILTER_FORM_ORDER.indexOf(left);
                    const rightIndex = STUDENT_FILTER_FORM_ORDER.indexOf(right);
                    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
                    if (leftIndex === -1) return 1;
                    if (rightIndex === -1) return -1;
                    return leftIndex - rightIndex;
                });
                renderSimpleFilterSelect(filterEducationForm, availableForms, STUDENT_FILTER_FORM_LABELS, 'Все');
            };

            syncOnePass();
            syncOnePass();
        };

        const findModalGroupById = (groupId) => {
            if (!groupId) return null;
            const id = String(groupId);
            return modalGroups.find(group => String(group.id) === id)
                || groups.find(group => String(group.id) === id)
                || null;
        };

        const renderStudentCourseOptions = (preferredCourse = '') => {
            if (!studentCourseEl) return;
            const selectedLevel = String(studentEducationLevelEl?.value || '');
            const maxCourse = STUDENT_MAX_COURSE_BY_LEVEL[selectedLevel] || 5;
            const previousValue = preferredCourse || studentCourseEl.value;
            const options = ['<option value="">Выберите курс</option>'];
            for (let course = 1; course <= maxCourse; course += 1) {
                options.push(`<option value="${course}">${course}</option>`);
            }
            studentCourseEl.innerHTML = options.join('');
            if (previousValue && Array.from(studentCourseEl.options).some(option => option.value === String(previousValue))) {
                studentCourseEl.value = String(previousValue);
            } else {
                studentCourseEl.value = '';
            }
        };

        const hideStudentGroupSuggestions = () => {
            if (!studentGroupSuggestionsEl) return;
            studentGroupSuggestionsEl.classList.add('d-none');
            studentGroupSuggestionsEl.innerHTML = '';
        };

        const renderStudentGroupSuggestions = () => {
            if (!studentGroupSearchEl || !studentGroupSuggestionsEl) return;
            const query = String(studentGroupSearchEl.value || '').trim().toLowerCase();
            if (!query || document.activeElement !== studentGroupSearchEl) {
                hideStudentGroupSuggestions();
                return;
            }
            const suggestions = currentStudentGroupOptions.slice(0, 8);
            if (!suggestions.length) {
                hideStudentGroupSuggestions();
                return;
            }
            studentGroupSuggestionsEl.innerHTML = suggestions.map(group => `
                <button type="button" class="list-group-item list-group-item-action" data-group-id="${group.id}">
                    <div class="fw-semibold">${safeValue(group.code)}</div>
                    <small class="text-muted">${safeValue(group.directionName)}</small>
                </button>
            `).join('');
            studentGroupSuggestionsEl.classList.remove('d-none');
        };

        const renderStudentGroupsByDependencies = (preferredGroupId = '') => {
            const previousValue = preferredGroupId || studentGroupEl.value;
            const selectedCourse = Number(studentCourseEl.value);
            const selectedLevel = String(studentEducationLevelEl.value || '');
            const selectedGroupEducationForm = getGroupFormByStudentForm(studentEducationFormEl.value);
            const selectedFacultyId = String(studentFacultyEl.value || '');
            const selectedDirectionId = String(studentDirectionEl.value || '');
            const groupSearchQuery = String(studentGroupSearchEl?.value || '').trim().toLowerCase();

            const filteredGroups = (modalGroups || []).filter(group => {
                if (selectedFacultyId && String(group.facultyId || '') !== selectedFacultyId) {
                    return false;
                }
                if (selectedDirectionId && String(group.directionId || '') !== selectedDirectionId) {
                    return false;
                }
                if (selectedLevel && String(group.educationLevel || '') !== selectedLevel) {
                    return false;
                }
                if (!Number.isNaN(selectedCourse) && selectedCourse > 0 && Number(group.course) !== selectedCourse) {
                    return false;
                }
                if (selectedGroupEducationForm && String(group.educationForm || '') !== selectedGroupEducationForm) {
                    return false;
                }
                if (groupSearchQuery && !String(group.code || '').toLowerCase().includes(groupSearchQuery)) {
                    return false;
                }
                return true;
            }).sort((left, right) => String(left.code || '').localeCompare(String(right.code || ''), 'ru-RU', {
                numeric: true,
                sensitivity: 'base'
            }));
            currentStudentGroupOptions = filteredGroups;

            renderSelect(studentGroupEl, filteredGroups, 'Выберите группу');
            if (previousValue && filteredGroups.some(group => String(group.id) === String(previousValue))) {
                studentGroupEl.value = String(previousValue);
            } else {
                studentGroupEl.value = '';
            }
        };

        const loadModalGroups = async (directionId, preferredGroupId = '') => {
            const url = directionId ? `/api/groups?directionId=${directionId}` : '/api/groups';
            modalGroups = await api(url);
            renderStudentGroupsByDependencies(preferredGroupId);
        };

        const syncStudentFieldsFromGroup = async (group, options = {}) => {
            if (!group) return;
            const syncHierarchy = options.syncHierarchy !== false;

            if (group.educationLevel) {
                studentEducationLevelEl.value = String(group.educationLevel);
            }
            renderStudentCourseOptions(group.course != null ? String(group.course) : '');
            if (group.course != null) {
                if (Array.from(studentCourseEl.options).some(option => option.value === String(group.course))) {
                    studentCourseEl.value = String(group.course);
                } else {
                    studentCourseEl.value = '';
                }
            }
            if (group.educationForm) {
                studentEducationFormEl.value = getStudentFormByGroupForm(group.educationForm);
            }

            if (syncHierarchy) {
                const targetFacultyId = group.facultyId != null ? String(group.facultyId) : '';
                const targetDirectionId = group.directionId != null ? String(group.directionId) : '';
                const targetGroupId = group.id != null ? String(group.id) : '';

                if (targetFacultyId && studentFacultyEl.value !== targetFacultyId) {
                    studentFacultyEl.value = targetFacultyId;
                    await loadDirections(studentFacultyEl.value, {renderFilter: false, renderModal: true});
                } else if (!studentDirectionEl.options.length) {
                    await loadDirections(studentFacultyEl.value, {renderFilter: false, renderModal: true});
                }

                if (targetDirectionId && studentDirectionEl.value !== targetDirectionId) {
                    studentDirectionEl.value = targetDirectionId;
                }

                await loadModalGroups(studentDirectionEl.value, targetGroupId);
            }

            renderStudentGroupsByDependencies(group.id != null ? String(group.id) : '');
        };

        const loadStudents = async () => {
            const params = new URLSearchParams();
            if (filterFaculty.value) params.append('facultyId', filterFaculty.value);
            if (filterDirection.value) params.append('directionId', filterDirection.value);
            if (filterGroup.value) params.append('groupId', filterGroup.value);
            if (filterEducationLevel?.value) params.append('educationLevel', filterEducationLevel.value);
            if (filterCourse.value) params.append('course', filterCourse.value);
            if (filterEducationForm?.value) params.append('educationForm', filterEducationForm.value);
            if (filterAccelerated?.checked) params.append('accelerated', 'true');
            if (filterStatus.value) params.append('status', filterStatus.value);
            if (filterSearch.value) params.append('search', filterSearch.value);
            if (filterSort.value) params.append('sortBy', filterSort.value);
            if (filterSortDirection.value) params.append('sortDirection', filterSortDirection.value);
            params.append('page', currentPage);
            params.append('size', Number(pageSizeSelect.value) || 10);
            const url = `/api/students/search?${params.toString()}`;
            const pageResult = await api(url);
            if (pageResult.totalPages > 0 && currentPage >= pageResult.totalPages) {
                currentPage = pageResult.totalPages - 1;
                return loadStudents();
            }
            const students = pageResult.content || [];
            studentsCount.textContent = pageResult.totalElements ?? students.length;
            studentTableBody.innerHTML = students.length === 0
                ? `<tr><td colspan="8" class="text-center text-muted py-4">Ничего не найдено</td></tr>`
                : students.map(renderStudentRow).join('');
            bindStudentActions();
            renderPagination(pageResult.page, pageResult.totalPages);
        };

        const renderStudentRow = (student) => {
            return `<tr data-id="${student.id}">
                <td class="col-fio fw-semibold">${student.fullName}</td>
                <td class="col-record-book">${formatStudentRecordBookForDisplay(student)}</td>
                <td class="col-course">${student.course}</td>
                <td class="col-group"><span class="badge text-bg-light">${safeValue(student.groupCode)}</span></td>
                <td class="col-direction">${safeValue(student.directionName)}</td>
                <td class="col-faculty">${safeValue(formatFacultyName(student.facultyName))}</td>
                <td class="col-status">${renderStatus(student.status)}</td>
                <td class="col-actions text-end">
                    <div class="table-actions justify-content-end">
                        <button class="btn-circle" data-action="edit"><i class="bi bi-pencil"></i></button>
                        <button class="btn-circle text-danger" data-action="delete"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        };

        const renderStatus = (status) => {
            return `<span class="badge text-bg-light">${getStudentStatusLabel(status)}</span>`;
        };

        const renderSelect = (selectEl, list, placeholder) => {
            if (!selectEl) return;
            const previousValue = selectEl.value;
            const options = [`<option value="">${placeholder}</option>`]
                .concat(list.map(item => `<option value="${item.id}">${item.displayName || item.name || item.code}</option>`));
            selectEl.innerHTML = options.join('');
            if (previousValue && Array.from(selectEl.options).some(option => option.value === String(previousValue))) {
                selectEl.value = String(previousValue);
            }
        };

        const renderPagination = (page, totalPages) => {
            lastTotalPages = totalPages || 0;
            renderPaginationControls({
                page,
                totalPages: lastTotalPages,
                firstBtn: pageFirst,
                prevBtn: pagePrev,
                numbersEl: pageNumbers,
                nextBtn: pageNext,
                lastBtn: pageLast
            });
        };

        const bindStudentActions = () => {
            document.querySelectorAll('#studentTableBody [data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', async (event) => {
                    const id = event.currentTarget.closest('tr').dataset.id;
                    const student = await api(`/api/students/${id}`);
                    await fillStudentForm(student);
                    const modal = new bootstrap.Modal(document.getElementById('studentModal'));
                    modal.show();
                });
            });
            document.querySelectorAll('#studentTableBody [data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', async (event) => {
                    const id = event.currentTarget.closest('tr').dataset.id;
                    if (await confirmAction({
                        title: 'Удаление студента',
                        message: 'Удалить студента каскадно? История и связанные черновики будут очищены. В подписанных приказах сведения о студенте сохранятся.',
                        confirmText: 'Удалить'
                    })) {
                        await api(`/api/students/${id}`, {method: 'DELETE'});
                        toast('Студент удалён');
                        await loadStudents();
                    }
                });
            });
        };

        const showStudentNameValidationError = (inputEl, feedbackEl, message) => {
            if (!inputEl) return;
            inputEl.setCustomValidity(message || 'Некорректное значение');
            inputEl.classList.add('is-invalid');
            if (feedbackEl) {
                feedbackEl.textContent = message || 'Некорректное значение';
                feedbackEl.classList.add('d-block');
            }
            if (studentFormEl) {
                studentFormEl.classList.add('was-validated');
            }
            inputEl.reportValidity();
        };

        const syncStudentNameFieldState = (inputEl, feedbackEl, fieldLabel, required, forceValidation = false) => {
            if (!inputEl) return '';
            const rules = getStudentPersonNameRules(fieldLabel);
            const normalizedValue = normalizeStudentPersonName(inputEl.value);

            if (!forceValidation && !normalizedValue) {
                inputEl.setCustomValidity('');
                inputEl.classList.remove('is-invalid');
                if (feedbackEl) {
                    feedbackEl.textContent = required ? rules.required : rules.invalid;
                    feedbackEl.classList.remove('d-block');
                }
                return '';
            }

            const reason = validateStudentPersonName(normalizedValue, fieldLabel, required);
            if (reason) {
                inputEl.setCustomValidity(reason);
                inputEl.classList.add('is-invalid');
                if (feedbackEl) {
                    feedbackEl.textContent = reason;
                    if (forceValidation) {
                        feedbackEl.classList.add('d-block');
                    }
                }
                return reason;
            }

            inputEl.setCustomValidity('');
            inputEl.classList.remove('is-invalid');
            if (feedbackEl) {
                feedbackEl.textContent = required ? rules.required : rules.invalid;
                feedbackEl.classList.remove('d-block');
            }
            return '';
        };

        const clearStudentNameValidationErrors = () => {
            syncStudentNameFieldState(studentLastNameEl, studentLastNameFeedback, 'Фамилия', true, false);
            syncStudentNameFieldState(studentFirstNameEl, studentFirstNameFeedback, 'Имя', true, false);
            syncStudentNameFieldState(studentMiddleNameEl, studentMiddleNameFeedback, 'Отчество', false, false);
        };

        const findStudentFieldFeedback = (inputEl) => inputEl?.parentElement?.querySelector('.invalid-feedback') || null;

        const clearStudentDocDuplicateErrors = () => {
            [studentRecordBookEl, studentContractNumberEl].forEach((inputEl) => {
                if (!inputEl) return;
                inputEl.setCustomValidity('');
                inputEl.classList.remove('is-invalid');
                const feedbackEl = findStudentFieldFeedback(inputEl);
                if (feedbackEl) {
                    if (!feedbackEl.dataset.defaultMessage) {
                        feedbackEl.dataset.defaultMessage = feedbackEl.textContent || '';
                    }
                    feedbackEl.textContent = feedbackEl.dataset.defaultMessage;
                    feedbackEl.classList.remove('d-block');
                }
            });
        };

        const showStudentDocDuplicateErrors = (message) => {
            [studentRecordBookEl, studentContractNumberEl].forEach((inputEl) => {
                if (!inputEl) return;
                inputEl.setCustomValidity(message);
                inputEl.classList.add('is-invalid');
                const feedbackEl = findStudentFieldFeedback(inputEl);
                if (feedbackEl) {
                    if (!feedbackEl.dataset.defaultMessage) {
                        feedbackEl.dataset.defaultMessage = feedbackEl.textContent || '';
                    }
                    feedbackEl.textContent = message;
                    feedbackEl.classList.add('d-block');
                }
            });
            if (studentFormEl) {
                studentFormEl.classList.add('was-validated');
            }
        };

        const fillStudentForm = async (student) => {
            document.getElementById('studentModalTitle').textContent = 'Редактирование студента';
            clearStudentNameValidationErrors();
            clearStudentDocDuplicateErrors();
            studentIdEl.value = student.id;
            studentLastNameEl.value = safeValue(student.lastName);
            studentFirstNameEl.value = safeValue(student.firstName);
            studentMiddleNameEl.value = safeValue(student.middleName);
            const admissionDate = student.studyStartDate || '';
            studentStudyStartDateEl.value = admissionDate;
            studentRecordBookEl.value = student.recordBook || '';
            studentEducationLevelEl.value = '';
            renderStudentCourseOptions(student.course ? String(student.course) : '');
            studentCourseEl.value = student.course ? String(student.course) : '';
            studentStatusEl.value = student.status;
            syncStudyStartDateRequiredState();
            studentEducationFormEl.value = safeValue(student.educationForm) || 'Очная';
            studentEducationBaseEl.value = safeValue(student.educationBase) || 'Бюджет';
            if (studentHasAcademicDebtsEl) {
                studentHasAcademicDebtsEl.checked = Boolean(student.hasAcademicDebts);
            }
            studentContractNumberEl.value = safeValue(student.studyContractNumber);
            studentPhoneEl.value = safeValue(student.phone);
            studentEmailEl.value = safeValue(student.email);
            studentBirthDateEl.value = student.birthDate || '';
            if (studentGroupSearchEl) {
                studentGroupSearchEl.value = '';
            }
            hideStudentGroupSuggestions();

            applyPhoneMask();
            applyEmailMask();
            applyRecordBookMask();
            applyContractNumberMask();

            studentFacultyEl.value = student.facultyId
                || faculties.find(f => stripFacultyPrefix(f.name) === stripFacultyPrefix(student.facultyName))?.id
                || '';
            await loadDirections(studentFacultyEl.value, {renderFilter: false, renderModal: true});
            studentDirectionEl.value = student.directionId || directions.find(d => d.name === student.directionName)?.id || '';
            await loadModalGroups(studentDirectionEl.value, student.groupId || '');

            if (student.groupId) {
                const selectedGroup = findModalGroupById(student.groupId);
                if (selectedGroup) {
                    await syncStudentFieldsFromGroup(selectedGroup, {syncHierarchy: false});
                }
                studentGroupEl.value = String(student.groupId);
            } else {
                renderStudentGroupsByDependencies();
            }
        };

        const resetStudentForm = () => {
            document.getElementById('studentModalTitle').textContent = 'Добавление студента';
            studentFormEl.reset();
            studentFormEl.classList.remove('was-validated');
            studentIdEl.value = '';
            modalGroups = [];
            studentEducationLevelEl.value = '';
            renderStudentCourseOptions('');
            studentStatusEl.value = '';
            syncStudyStartDateRequiredState();
            studentEducationFormEl.value = '';
            studentEducationBaseEl.value = '';
            if (studentHasAcademicDebtsEl) {
                studentHasAcademicDebtsEl.checked = false;
            }
            studentFacultyEl.value = '';
            studentDirectionEl.innerHTML = '<option value="">Выберите направление</option>';
            studentGroupEl.innerHTML = '<option value="">Выберите группу</option>';
            if (studentGroupSearchEl) {
                studentGroupSearchEl.value = '';
            }
            hideStudentGroupSuggestions();
            clearStudentNameValidationErrors();
            clearStudentDocDuplicateErrors();
        };

        document.getElementById('saveStudentBtn').addEventListener('click', async () => {
            clearStudentNameValidationErrors();
            clearStudentDocDuplicateErrors();

            const normalizedLastName = normalizeStudentPersonName(studentLastNameEl.value);
            const normalizedFirstName = normalizeStudentPersonName(studentFirstNameEl.value);
            const normalizedMiddleName = normalizeStudentPersonName(studentMiddleNameEl.value);

            const lastNameReason = syncStudentNameFieldState(studentLastNameEl, studentLastNameFeedback, 'Фамилия', true, true);
            if (lastNameReason) {
                showStudentNameValidationError(studentLastNameEl, studentLastNameFeedback, lastNameReason);
                toast(lastNameReason, 'danger');
                return;
            }
            const firstNameReason = syncStudentNameFieldState(studentFirstNameEl, studentFirstNameFeedback, 'Имя', true, true);
            if (firstNameReason) {
                showStudentNameValidationError(studentFirstNameEl, studentFirstNameFeedback, firstNameReason);
                toast(firstNameReason, 'danger');
                return;
            }
            const middleNameReason = syncStudentNameFieldState(studentMiddleNameEl, studentMiddleNameFeedback, 'Отчество', false, true);
            if (middleNameReason) {
                showStudentNameValidationError(studentMiddleNameEl, studentMiddleNameFeedback, middleNameReason);
                toast(middleNameReason, 'danger');
                return;
            }

            studentLastNameEl.value = normalizedLastName;
            studentFirstNameEl.value = normalizedFirstName;
            studentMiddleNameEl.value = normalizedMiddleName;
            applyPhoneMask();
            applyEmailMask();
            applyRecordBookMask();
            applyContractNumberMask();
            const admissionDate = studentStudyStartDateEl.value || '';
            studentStudyStartDateEl.value = admissionDate;
            syncStudyStartDateRequiredState();
            if (studentStatusEl.value !== 'NEW' && !admissionDate) {
                studentStudyStartDateEl.setCustomValidity('Укажите дату начала обучения.');
            } else {
                studentStudyStartDateEl.setCustomValidity('');
            }

            if (!studentFormEl.checkValidity()) {
                studentFormEl.classList.add('was-validated');
                return;
            }

            const payload = {
                lastName: normalizedLastName,
                firstName: normalizedFirstName,
                middleName: normalizedMiddleName,
                recordBook: studentRecordBookEl.value.trim(),
                course: Number(studentCourseEl.value),
                status: studentStatusEl.value,
                groupId: Number(studentGroupEl.value),
                educationForm: studentEducationFormEl.value,
                educationBase: studentEducationBaseEl.value,
                hasAcademicDebts: Boolean(studentHasAcademicDebtsEl?.checked),
                studyContractNumber: studentContractNumberEl.value.trim(),
                studyStartDate: admissionDate || null,
                phone: studentPhoneEl.value,
                email: studentEmailEl.value,
                birthDate: studentBirthDateEl.value || null
            };
            const id = studentIdEl.value;
            const url = id ? `/api/students/${id}` : '/api/students';
            const method = id ? 'PUT' : 'POST';
            try {
                await api(url, {method, body: JSON.stringify(payload)});
                bootstrap.Modal.getInstance(studentModalEl).hide();
                toast('Студент сохранён');
                resetStudentForm();
                await loadStudents();
            } catch (error) {
                let validationMessage = extractValidationMessage(error)
                    || 'Не удалось сохранить студента.';
                if (isDuplicateStudentDocError(error)) {
                    validationMessage = DUPLICATE_STUDENT_DOC_MESSAGE;
                    showStudentDocDuplicateErrors(validationMessage);
                }
                toast(validationMessage, 'danger');
            }
        });

        studentModalEl.addEventListener('hidden.bs.modal', resetStudentForm);
        studentModalEl.addEventListener('show.bs.modal', async () => {
            if (studentIdEl.value) {
                return;
            }
            try {
                const selectedFacultyId = filterFaculty.value;
                const selectedDirectionId = filterDirection.value;
                const selectedGroupId = filterGroup.value;
                const selectedCourse = filterCourse.value;

                if (selectedFacultyId && Array.from(studentFacultyEl.options).some(option => option.value === String(selectedFacultyId))) {
                    studentFacultyEl.value = String(selectedFacultyId);
                } else {
                    studentFacultyEl.value = '';
                }

                await loadDirections(studentFacultyEl.value, {renderFilter: false, renderModal: true});
                if (selectedDirectionId && Array.from(studentDirectionEl.options).some(option => option.value === String(selectedDirectionId))) {
                    studentDirectionEl.value = String(selectedDirectionId);
                } else {
                    studentDirectionEl.value = '';
                }

                renderStudentCourseOptions(selectedCourse || '');
                if (selectedCourse) {
                    studentCourseEl.value = selectedCourse;
                }

                await loadModalGroups(studentDirectionEl.value, selectedGroupId || '');
                if (selectedGroupId) {
                    const selectedGroup = findModalGroupById(selectedGroupId);
                    if (selectedGroup) {
                        await syncStudentFieldsFromGroup(selectedGroup);
                    }
                } else {
                    renderStudentGroupsByDependencies();
                }
            } catch (error) {
                toast(error.message, 'danger');
            }
        });

        studentLastNameEl.addEventListener('input', () => {
            syncStudentNameFieldState(studentLastNameEl, studentLastNameFeedback, 'Фамилия', true, false);
        });
        studentFirstNameEl.addEventListener('input', () => {
            syncStudentNameFieldState(studentFirstNameEl, studentFirstNameFeedback, 'Имя', true, false);
        });
        studentMiddleNameEl.addEventListener('input', () => {
            syncStudentNameFieldState(studentMiddleNameEl, studentMiddleNameFeedback, 'Отчество', false, false);
        });

        studentFacultyEl.addEventListener('change', async (event) => {
            await loadDirections(event.target.value, {renderFilter: false, renderModal: true});
            studentDirectionEl.value = '';
            await loadModalGroups('');
        });
        studentDirectionEl.addEventListener('change', async (event) => {
            await loadModalGroups(event.target.value);
        });
        studentEducationLevelEl.addEventListener('change', () => {
            renderStudentCourseOptions();
            renderStudentGroupsByDependencies();
        });
        studentStatusEl.addEventListener('change', () => {
            syncStudyStartDateRequiredState();
            if (studentStatusEl.value === 'NEW') {
                studentStudyStartDateEl.setCustomValidity('');
            }
        });
        studentCourseEl.addEventListener('change', () => {
            renderStudentGroupsByDependencies();
        });
        studentEducationFormEl.addEventListener('change', () => {
            renderStudentGroupsByDependencies();
        });
        studentGroupEl.addEventListener('change', async () => {
            const selectedGroup = findModalGroupById(studentGroupEl.value);
            if (!selectedGroup) {
                return;
            }
            if (studentGroupSearchEl) {
                studentGroupSearchEl.value = safeValue(selectedGroup.code);
            }
            hideStudentGroupSuggestions();
            await syncStudentFieldsFromGroup(selectedGroup);
        });
        if (studentGroupSearchEl) {
            studentGroupSearchEl.addEventListener('input', () => {
                renderStudentGroupsByDependencies();
                renderStudentGroupSuggestions();
            });
            studentGroupSearchEl.addEventListener('blur', () => {
                window.setTimeout(() => {
                    hideStudentGroupSuggestions();
                }, 120);
            });
            studentGroupSearchEl.addEventListener('keydown', async (event) => {
                if (event.key !== 'Enter') {
                    return;
                }
                event.preventDefault();
                const query = String(studentGroupSearchEl.value || '').trim().toLowerCase();
                if (!query) {
                    return;
                }
                const exactMatch = currentStudentGroupOptions.find(group => String(group.code || '').toLowerCase() === query);
                const targetGroup = exactMatch || currentStudentGroupOptions[0];
                if (!targetGroup) {
                    return;
                }
                studentGroupEl.value = String(targetGroup.id);
                studentGroupSearchEl.value = safeValue(targetGroup.code);
                hideStudentGroupSuggestions();
                await syncStudentFieldsFromGroup(targetGroup);
            });
        }
        if (studentGroupSuggestionsEl) {
            studentGroupSuggestionsEl.addEventListener('click', async (event) => {
                const option = event.target.closest('[data-group-id]');
                if (!option) {
                    return;
                }
                const selectedGroup = findModalGroupById(option.dataset.groupId);
                if (!selectedGroup) {
                    return;
                }
                studentGroupEl.value = String(selectedGroup.id);
                if (studentGroupSearchEl) {
                    studentGroupSearchEl.value = safeValue(selectedGroup.code);
                }
                hideStudentGroupSuggestions();
                await syncStudentFieldsFromGroup(selectedGroup);
            });
        }
        document.addEventListener('click', (event) => {
            if (!studentGroupSearchEl || !studentGroupSuggestionsEl) return;
            const picker = studentGroupSearchEl.closest('.student-group-picker');
            if (!picker) return;
            if (!picker.contains(event.target)) {
                hideStudentGroupSuggestions();
            }
        });
        studentStudyStartDateEl.addEventListener('change', () => {
            clearStudentDocDuplicateErrors();
            applyRecordBookMask();
            applyContractNumberMask();
            if (studentStatusEl.value !== 'NEW' && !studentStudyStartDateEl.value) {
                studentStudyStartDateEl.setCustomValidity('Укажите дату начала обучения.');
            } else {
                studentStudyStartDateEl.setCustomValidity('');
            }
        });
        studentPhoneEl.addEventListener('input', applyPhoneMask);
        studentPhoneEl.addEventListener('blur', applyPhoneMask);
        studentEmailEl.addEventListener('input', applyEmailMask);
        studentEmailEl.addEventListener('blur', applyEmailMask);
        studentRecordBookEl.addEventListener('input', () => {
            clearStudentDocDuplicateErrors();
            applyRecordBookMask();
        });
        studentRecordBookEl.addEventListener('blur', () => {
            clearStudentDocDuplicateErrors();
            applyRecordBookMask();
        });
        studentContractNumberEl.addEventListener('input', () => {
            clearStudentDocDuplicateErrors();
            applyContractNumberMask();
        });
        studentContractNumberEl.addEventListener('blur', () => {
            clearStudentDocDuplicateErrors();
            applyContractNumberMask();
        });
        filterFaculty.addEventListener('change', () => {
            currentPage = 0;
            loadDirections(filterFaculty.value, {renderFilter: true, renderModal: false})
                .then(() => loadGroups(filterDirection.value, {renderFilter: true}))
                .then(() => {
                    syncStudentsFilterDependencies();
                })
                .then(loadStudents);
        });
        filterDirection.addEventListener('change', () => {
            currentPage = 0;
            loadGroups(filterDirection.value, {renderFilter: true})
                .then(() => {
                    syncStudentsFilterDependencies();
                })
                .then(loadStudents);
        });
        filterGroup.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        if (filterEducationLevel) {
            filterEducationLevel.addEventListener('change', () => {
                currentPage = 0;
                syncStudentsFilterDependencies();
                loadStudents();
            });
        }
        filterCourse.addEventListener('change', () => {
            currentPage = 0;
            syncStudentsFilterDependencies();
            loadStudents();
        });
        if (filterEducationForm) {
            filterEducationForm.addEventListener('change', () => {
                currentPage = 0;
                syncStudentsFilterDependencies();
                loadStudents();
            });
        }
        if (filterAccelerated) {
            filterAccelerated.addEventListener('change', () => {
                currentPage = 0;
                syncStudentsFilterDependencies();
                loadStudents();
            });
        }
        filterStatus.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        filterSort.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        filterSortDirection.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        applyBtn.addEventListener('click', () => {
            currentPage = 0;
            loadStudents();
        });
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                currentPage = 0;
                loadStudents().catch(err => toast(err.message, 'danger'));
            });
        }
        pageSizeSelect.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        pageFirst.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage = 0;
                loadStudents();
            }
        });
        pagePrev.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage -= 1;
                loadStudents();
            }
        });
        pageNumbers.addEventListener('click', (event) => {
            const button = event.target.closest('[data-page-index]');
            if (!button) return;
            const targetPage = Number(button.dataset.pageIndex);
            if (!Number.isNaN(targetPage) && targetPage !== currentPage) {
                currentPage = targetPage;
                loadStudents();
            }
        });
        pageNext.addEventListener('click', () => {
            if (currentPage < lastTotalPages - 1) {
                currentPage += 1;
                loadStudents();
            }
        });
        pageLast.addEventListener('click', () => {
            if (lastTotalPages > 0 && currentPage < lastTotalPages - 1) {
                currentPage = lastTotalPages - 1;
                loadStudents();
            }
        });
        resetBtn.addEventListener('click', async () => {
            filterFaculty.value = '';
            filterDirection.value = '';
            filterGroup.value = '';
            if (filterEducationLevel) filterEducationLevel.value = '';
            filterCourse.value = '';
            if (filterEducationForm) filterEducationForm.value = '';
            if (filterAccelerated) filterAccelerated.checked = false;
            filterStatus.value = '';
            filterSort.value = 'id';
            filterSortDirection.value = 'desc';
            filterSearch.value = '';
            currentPage = 0;
            syncStudentsFilterDependencies();
            await loadStudents();
        });

        renderStudentCourseOptions();
        syncStudyStartDateRequiredState();

        (async () => {
            await loadFaculties();
            await loadDirections();
            await loadGroups();
            syncStudentsFilterDependencies();
            await loadStudents();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Группы =====
    function initGroupsPage() {
        const page = document.getElementById('groupsPage');
        if (!page) return;

        const table = document.getElementById('groupsTable');
        const groupsCount = document.getElementById('groupsCount');
        const searchEl = document.getElementById('groupSearch');
        const facultyFilter = document.getElementById('groupFacultyFilter');
        const directionFilter = document.getElementById('groupDirectionFilter');
        const courseFilter = document.getElementById('groupCourseFilter');
        const educationLevelFilter = document.getElementById('groupEducationLevelFilter');
        const educationFormFilter = document.getElementById('groupEducationFormFilter');
        const acceleratedFilter = document.getElementById('groupAcceleratedFilter');
        const sortEl = document.getElementById('groupSort');
        const sortDirectionEl = document.getElementById('groupSortDirection');
        const resetFiltersBtn = document.getElementById('resetGroupFilters');
        const pageSizeSelect = document.getElementById('groupsPageSize');
        const pageFirst = document.getElementById('groupsPageFirst');
        const pagePrev = document.getElementById('groupsPagePrev');
        const pageNumbers = document.getElementById('groupsPageNumbers');
        const pageNext = document.getElementById('groupsPageNext');
        const pageLast = document.getElementById('groupsPageLast');
        const groupModalEl = document.getElementById('groupModal');
        const groupForm = document.getElementById('groupForm');
        const groupModalTitleEl = document.getElementById('groupModalTitle');
        const groupIdEl = document.getElementById('groupId');
        const groupEducationLevelEl = document.getElementById('groupEducationLevel');
        const groupEducationFormEl = document.getElementById('groupEducationForm');
        const groupAcceleratedEl = document.getElementById('groupAccelerated');
        const groupCourseEl = document.getElementById('groupCourse');
        const groupNumberEl = document.getElementById('groupNumber');
        const groupCodePreviewEl = document.getElementById('groupCodePreview');
        const groupDirectionSelectEl = document.getElementById('groupDirectionSelect');
        const groupFacultySelectEl = document.getElementById('groupFacultySelect');

        let faculties = [];
        let directions = [];
        let modalDirections = [];
        let sourceGroups = [];
        let allGroups = [];
        let currentPage = 0;
        let lastTotalPages = 1;
        let groupDeleteModalEl = null;
        let groupDeleteModalInstance = null;
        const groupDeleteState = {
            sourceGroup: null,
            students: [],
            targetGroups: [],
            targetGroupId: null
        };

        const renderSelect = (selectEl, list, placeholder) => {
            if (!selectEl) return;
            const previousValue = selectEl.value;
            const opts = [`<option value="">${placeholder}</option>`]
                .concat(list.map(item => `<option value="${item.id}">${item.displayName || item.name || item.code}</option>`));
            selectEl.innerHTML = opts.join('');
            if (previousValue && Array.from(selectEl.options).some(option => option.value === String(previousValue))) {
                selectEl.value = String(previousValue);
            }
        };

        const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), 'ru-RU', {
            numeric: true,
            sensitivity: 'base'
        });

        const LEVEL_SUFFIX = {
            BACHELOR: 'б',
            SPECIALIST: 'с',
            MASTER: 'м'
        };

        const FORM_SUFFIX = {
            FULL_TIME: 'д',
            PART_TIME: 'в',
            DISTANCE: 'з'
        };

        const resolveMaxCourse = (educationLevel, accelerated) => {
            if (educationLevel === 'BACHELOR') {
                return accelerated ? 3 : 4;
            }
            if (educationLevel === 'SPECIALIST') {
                return accelerated ? 4 : 5;
            }
            if (educationLevel === 'MASTER') {
                return accelerated ? 1 : 2;
            }
            return 5;
        };

        const renderCourseOptions = (educationLevel, accelerated, preferredCourse = '') => {
            const maxCourse = resolveMaxCourse(educationLevel, accelerated);
            const previousValue = preferredCourse || groupCourseEl.value;
            const options = ['<option value="">Выберите курс</option>'];
            for (let course = 1; course <= maxCourse; course += 1) {
                options.push(`<option value="${course}">${course}</option>`);
            }
            groupCourseEl.innerHTML = options.join('');
            if (previousValue && Array.from(groupCourseEl.options).some(option => option.value === String(previousValue))) {
                groupCourseEl.value = String(previousValue);
            } else if (groupCourseEl.options.length > 1) {
                groupCourseEl.value = groupCourseEl.options[1].value;
            } else {
                groupCourseEl.value = '';
            }
        };

        const renderCourseFilterOptions = (educationLevel, accelerated, preferredCourse = '') => {
            const maxCourse = resolveMaxCourse(educationLevel, accelerated);
            const previousValue = preferredCourse || courseFilter.value;
            const options = ['<option value="">Все</option>'];
            for (let course = 1; course <= maxCourse; course += 1) {
                options.push(`<option value="${course}">${course}</option>`);
            }
            courseFilter.innerHTML = options.join('');
            if (previousValue && Array.from(courseFilter.options).some(option => option.value === String(previousValue))) {
                courseFilter.value = String(previousValue);
            } else {
                courseFilter.value = '';
            }
        };

        const resolveDirectionShortName = (directionId) => {
            if (!directionId) return '';
            const direction = modalDirections.find(item => String(item.id) === String(directionId));
            return safeValue(direction?.shortName).toUpperCase();
        };

        const buildGroupCodePreview = () => {
            const directionShort = resolveDirectionShortName(groupDirectionSelectEl.value);
            const levelSuffix = LEVEL_SUFFIX[groupEducationLevelEl.value] || '';
            const formSuffix = FORM_SUFFIX[groupEducationFormEl.value] || '';
            const acceleratedSuffix = groupAcceleratedEl.checked ? 'у' : '';
            const course = groupCourseEl.value;
            const groupNumber = groupNumberEl.value;
            if (!directionShort || !levelSuffix || !formSuffix || !course || !groupNumber) {
                return '';
            }
            return `${directionShort}${levelSuffix}${formSuffix}${acceleratedSuffix}-${course}${groupNumber}`;
        };

        const refreshGroupCodePreview = () => {
            groupCodePreviewEl.value = buildGroupCodePreview();
        };

        const sortGroups = (groups) => {
            const mode = sortEl.value || 'name';
            const directionFactor = sortDirectionEl.value === 'desc' ? -1 : 1;
            return [...groups].sort((left, right) => {
                let cmp = 0;
                if (mode === 'faculty') {
                    cmp = compareText(left.facultyName, right.facultyName);
                    if (cmp === 0) {
                        cmp = compareText(left.directionName, right.directionName);
                    }
                } else if (mode === 'direction') {
                    cmp = compareText(left.directionName, right.directionName);
                    if (cmp === 0) {
                        cmp = compareText(left.facultyName, right.facultyName);
                    }
                } else if (mode === 'code' || mode === 'name') {
                    cmp = compareText(left.code, right.code);
                }

                if (cmp === 0) {
                    cmp = compareText(left.code, right.code);
                }
                if (cmp === 0) {
                    cmp = (Number(left.id) || 0) - (Number(right.id) || 0);
                }
                return cmp * directionFactor;
            });
        };

        const loadFaculties = async () => {
            faculties = mapFacultyForDisplay(await api('/api/faculties'));
            renderSelect(facultyFilter, faculties, 'Все');
            renderSelect(groupFacultySelectEl, faculties, 'Выберите факультет');
            renderSelect(groupDirectionSelectEl, [], 'Выберите направление');
        };

        const loadDirectionsForFilters = async (facultyId) => {
            const url = facultyId ? `/api/directions?facultyId=${facultyId}` : '/api/directions';
            directions = await api(url);
            renderSelect(directionFilter, directions, 'Все');
        };

        const loadDirectionsForModal = async (facultyId, preferredDirectionId = '') => {
            const url = facultyId ? `/api/directions?facultyId=${facultyId}` : '/api/directions';
            modalDirections = await api(url);
            const previousValue = groupDirectionSelectEl.value;
            const options = [`<option value="">Выберите направление</option>`]
                .concat(modalDirections.map(direction => {
                    const shortName = safeValue(direction.shortName);
                    const title = shortName ? `${shortName} — ${safeValue(direction.name)}` : safeValue(direction.name);
                    return `<option value="${direction.id}">${title}</option>`;
                }));
            groupDirectionSelectEl.innerHTML = options.join('');
            if (previousValue && modalDirections.some(direction => String(direction.id) === String(previousValue))) {
                groupDirectionSelectEl.value = String(previousValue);
            }
            if (preferredDirectionId
                && modalDirections.some(direction => String(direction.id) === String(preferredDirectionId))) {
                groupDirectionSelectEl.value = String(preferredDirectionId);
            }
            if (!groupDirectionSelectEl.value && modalDirections.length > 0) {
                groupDirectionSelectEl.value = String(modalDirections[0].id);
            }
            refreshGroupCodePreview();
        };

        const renderGroupsPage = () => {
            const paged = paginateLocal(allGroups, currentPage, Number(pageSizeSelect.value) || 10);
            currentPage = paged.page;
            lastTotalPages = paged.totalPages;
            const groups = paged.content;

            table.innerHTML = groups.length === 0
                ? `<tr><td colspan="6" class="text-center text-muted py-4">Нет данных</td></tr>`
                : groups.map(group => `<tr data-id="${group.id}">
                    <td class="col-name fw-semibold">${group.code}</td>
                    <td class="col-course">${group.course}</td>
                    <td class="col-direction">${group.directionName || ''}</td>
                    <td class="col-faculty">${safeValue(formatFacultyName(group.facultyName))}</td>
                    <td class="col-students">${group.studentsCount ?? 0}</td>
                    <td class="col-actions text-end">
                        <div class="table-actions">
                            <button class="btn-circle" data-action="edit"><i class="bi bi-pencil"></i></button>
                            <button class="btn-circle text-danger" data-action="delete"><i class="bi bi-trash"></i></button>
                        </div>
                    </td>
                </tr>`).join('');
            bindActions();
            renderPaginationControls({
                page: currentPage,
                totalPages: lastTotalPages,
                firstBtn: pageFirst,
                prevBtn: pagePrev,
                numbersEl: pageNumbers,
                nextBtn: pageNext,
                lastBtn: pageLast
            });
        };

        const applyGroupsFiltersAndSort = ({resetPage = false} = {}) => {
            let filteredGroups = [...sourceGroups];
            if (facultyFilter.value) {
                const selectedFacultyId = Number(facultyFilter.value);
                filteredGroups = filteredGroups.filter(group => Number(group.facultyId) === selectedFacultyId);
            }
            if (courseFilter.value) {
                const selectedCourse = Number(courseFilter.value);
                filteredGroups = filteredGroups.filter(group => Number(group.course) === selectedCourse);
            }
            if (educationLevelFilter?.value) {
                filteredGroups = filteredGroups.filter(group => String(group.educationLevel || '') === educationLevelFilter.value);
            }
            if (educationFormFilter?.value) {
                filteredGroups = filteredGroups.filter(group => String(group.educationForm || '') === educationFormFilter.value);
            }
            if (acceleratedFilter?.checked) {
                filteredGroups = filteredGroups.filter(group => Boolean(group.accelerated));
            }
            const query = String(searchEl?.value || '').trim().toLowerCase();
            if (query) {
                filteredGroups = filteredGroups.filter(group => {
                    return String(safeValue(group.code)).toLowerCase().includes(query);
                });
            }
            allGroups = sortGroups(filteredGroups);
            if (resetPage) {
                currentPage = 0;
            }
            groupsCount.textContent = allGroups.length;
            renderGroupsPage();
        };

        const loadGroups = async () => {
            const params = directionFilter.value ? `?directionId=${directionFilter.value}` : '';
            sourceGroups = await api('/api/groups' + params);
            applyGroupsFiltersAndSort({resetPage: true});
        };

        const ensureGroupDeleteModal = () => {
            if (groupDeleteModalEl) {
                return;
            }
            const modalMarkup = document.createElement('div');
            modalMarkup.innerHTML = `
                <div class="modal fade" id="groupDeleteTransferModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-xl modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header border-0">
                                <h2 class="modal-title h5 mb-0">Удаление группы с переводом студентов</h2>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning small mb-3">
                                    Перед удалением группы переведите всех её студентов в соседнюю группу того же направления, курса, формы и уровня обучения.
                                </div>
                                <div class="row g-3 align-items-end">
                                    <div class="col-lg-7">
                                        <label class="form-label">Группа перевода *</label>
                                        <select class="form-select" id="groupDeleteTargetGroup"></select>
                                    </div>
                                    <div class="col-lg-5">
                                        <div class="small text-muted" id="groupDeleteSummary"></div>
                                    </div>
                                </div>
                                <div class="table-responsive mt-3">
                                    <table class="table table-clean align-middle">
                                        <thead>
                                        <tr>
                                            <th style="width: 48%;">ФИО</th>
                                            <th style="width: 20%;">Зачётка</th>
                                            <th style="width: 16%;">Курс</th>
                                            <th style="width: 16%;">Статус</th>
                                        </tr>
                                        </thead>
                                        <tbody id="groupDeleteStudentsBody">
                                        <tr><td colspan="4" class="text-center text-muted py-3">Нет студентов</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="modal-footer border-0">
                                <button type="button" class="btn btn-outline-dark" data-bs-dismiss="modal">Отмена</button>
                                <button type="button" class="btn btn-danger" id="groupDeleteConfirmBtn">Удалить группу</button>
                            </div>
                        </div>
                    </div>
                </div>
            `.trim();
            document.body.appendChild(modalMarkup.firstElementChild);
            groupDeleteModalEl = document.getElementById('groupDeleteTransferModal');
            groupDeleteModalInstance = new bootstrap.Modal(groupDeleteModalEl);

            const targetGroupEl = document.getElementById('groupDeleteTargetGroup');
            const confirmBtn = document.getElementById('groupDeleteConfirmBtn');

            const renderGroupDeleteStudentsTable = () => {
                const bodyEl = document.getElementById('groupDeleteStudentsBody');
                const summaryEl = document.getElementById('groupDeleteSummary');
                if (!bodyEl) return;

                bodyEl.innerHTML = groupDeleteState.students.length === 0
                    ? '<tr><td colspan="4" class="text-center text-muted py-3">В выбранной группе нет студентов</td></tr>'
                    : groupDeleteState.students.map(student => `<tr>
                        <td>${escapeHtml(student.fullName || '')}</td>
                        <td>${escapeHtml(safeValue(student.recordBook))}</td>
                        <td>${escapeHtml(safeValue(student.course))}</td>
                        <td>${escapeHtml(getStudentStatusLabel(student.status))}</td>
                    </tr>`).join('');

                if (summaryEl) {
                    summaryEl.textContent = `Студентов в группе: ${groupDeleteState.students.length}`;
                }
                if (confirmBtn) {
                    // Keep action available and show detailed validation message on click.
                    confirmBtn.disabled = false;
                }
            };

            targetGroupEl.addEventListener('change', () => {
                groupDeleteState.targetGroupId = targetGroupEl.value ? Number(targetGroupEl.value) : null;
                renderGroupDeleteStudentsTable();
            });

            confirmBtn.addEventListener('click', async () => {
                try {
                    if (!groupDeleteState.sourceGroup) return;

                    if (groupDeleteState.students.length === 0) {
                        if (await confirmAction({
                            title: 'Удаление группы',
                            message: 'Удалить группу? В ней нет студентов.',
                            confirmText: 'Удалить'
                        })) {
                            await withButtonLoading(confirmBtn, 'Удаляем группу...', async () => {
                                await api(`/api/groups/${groupDeleteState.sourceGroup.id}`, {method: 'DELETE'});
                            });
                            groupDeleteModalInstance.hide();
                            toast('Группа удалена');
                            await loadGroups();
                        }
                        return;
                    }

                    if (!groupDeleteState.targetGroupId) {
                        toast('Выберите группу перевода.', 'danger');
                        return;
                    }

                    await withButtonLoading(confirmBtn, 'Переводим студентов и удаляем...', async () => {
                        await api(`/api/groups/${groupDeleteState.sourceGroup.id}/delete-with-transfer`, {
                            method: 'POST',
                            body: JSON.stringify({targetGroupId: groupDeleteState.targetGroupId})
                        });
                    });
                    groupDeleteModalInstance.hide();
                    toast('Группа удалена, студенты переведены');
                    await loadGroups();
                } catch (error) {
                    toast(error?.message || 'Не удалось удалить группу.', 'danger');
                }
            });

            groupDeleteModalEl.addEventListener('hidden.bs.modal', () => {
                groupDeleteState.sourceGroup = null;
                groupDeleteState.students = [];
                groupDeleteState.targetGroups = [];
                groupDeleteState.targetGroupId = null;
            });
        };

        const openGroupDeleteModal = async (group) => {
            ensureGroupDeleteModal();
            groupDeleteState.sourceGroup = group;
            groupDeleteState.students = await api(`/api/students?groupId=${group.id}`);

            const directionGroups = await api(`/api/groups?directionId=${group.directionId}`);
            groupDeleteState.targetGroups = directionGroups.filter(item =>
                Number(item.id) !== Number(group.id)
                && Number(item.course) === Number(group.course)
                && String(item.educationLevel || '') === String(group.educationLevel || '')
                && String(item.educationForm || '') === String(group.educationForm || '')
                && Boolean(item.accelerated) === Boolean(group.accelerated)
            );

            if (groupDeleteState.students.length > 0 && groupDeleteState.targetGroups.length === 0) {
                toast('Не найдена соседняя группа для перевода студентов (тот же курс, уровень, форма и ускоренная).', 'danger');
                return;
            }

            const targetGroupEl = document.getElementById('groupDeleteTargetGroup');
            targetGroupEl.innerHTML = groupDeleteState.targetGroups.length === 0
                ? '<option value="">Нет доступных групп</option>'
                : ['<option value="">Выберите группу</option>'].concat(
                    groupDeleteState.targetGroups.map(item => `<option value="${item.id}">${escapeHtml(item.code)}</option>`)
                ).join('');
            groupDeleteState.targetGroupId = groupDeleteState.targetGroups.length > 0
                ? Number(groupDeleteState.targetGroups[0].id)
                : null;
            targetGroupEl.value = groupDeleteState.targetGroupId ? String(groupDeleteState.targetGroupId) : '';

            const event = new Event('change');
            targetGroupEl.dispatchEvent(event);
            groupDeleteModalInstance.show();
        };

        const bindActions = () => {
            table.querySelectorAll('[data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const group = allGroups.find(g => g.id == id)
                        || (await api('/api/groups')).find(g => g.id == id);
                    if (!group) return;
                    groupModalTitleEl.textContent = 'Редактирование группы';
                    groupIdEl.value = id;
                    groupEducationLevelEl.value = group.educationLevel || 'BACHELOR';
                    groupEducationFormEl.value = group.educationForm || 'FULL_TIME';
                    groupAcceleratedEl.checked = Boolean(group.accelerated);
                    groupNumberEl.value = group.groupNumber != null ? String(group.groupNumber) : '';
                    groupFacultySelectEl.value = group.facultyId != null ? String(group.facultyId) : '';
                    await loadDirectionsForModal(groupFacultySelectEl.value, group.directionId);
                    renderCourseOptions(groupEducationLevelEl.value, groupAcceleratedEl.checked, group.course);
                    refreshGroupCodePreview();
                    new bootstrap.Modal(groupModalEl).show();
                });
            });
            table.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const group = allGroups.find(item => String(item.id) === String(id))
                        || sourceGroups.find(item => String(item.id) === String(id));
                    if (!group) return;
                    openGroupDeleteModal(group).catch(err => toast(err.message, 'danger'));
                });
            });
        };

        document.getElementById('saveGroupBtn').addEventListener('click', async () => {
            if (!groupForm.checkValidity()) {
                groupForm.classList.add('was-validated');
                return;
            }
            const payload = {
                course: Number(groupCourseEl.value),
                directionId: Number(groupDirectionSelectEl.value),
                educationLevel: groupEducationLevelEl.value,
                educationForm: groupEducationFormEl.value,
                accelerated: Boolean(groupAcceleratedEl.checked),
                groupNumber: Number(groupNumberEl.value)
            };
            const id = groupIdEl.value;
            const url = id ? `/api/groups/${id}` : '/api/groups';
            const method = id ? 'PUT' : 'POST';
            try {
                await api(url, {method, body: JSON.stringify(payload)});
                bootstrap.Modal.getInstance(groupModalEl).hide();
                toast('Сохранено');
                groupForm.reset();
                groupForm.classList.remove('was-validated');
                groupIdEl.value = '';
                await loadGroups();
            } catch (error) {
                const validationMessage = extractValidationMessage(error)
                    || 'Не удалось сохранить группу.';
                toast(validationMessage, 'danger');
            }
        });

        groupModalEl.addEventListener('show.bs.modal', async () => {
            if (groupIdEl.value) {
                return;
            }
            groupEducationLevelEl.value = 'BACHELOR';
            groupEducationFormEl.value = 'FULL_TIME';
            groupAcceleratedEl.checked = false;
            groupNumberEl.value = '1';
            const selectedFacultyId = facultyFilter.value;
            if (selectedFacultyId && faculties.some(faculty => String(faculty.id) === String(selectedFacultyId))) {
                groupFacultySelectEl.value = String(selectedFacultyId);
            } else {
                groupFacultySelectEl.value = '';
            }
            const preferredDirectionId = directionFilter.value || '';
            await loadDirectionsForModal(groupFacultySelectEl.value, preferredDirectionId);
            const preferredCourse = Number(courseFilter.value);
            if (!Number.isNaN(preferredCourse) && preferredCourse > 4) {
                groupEducationLevelEl.value = 'SPECIALIST';
            }
            renderCourseOptions(groupEducationLevelEl.value, groupAcceleratedEl.checked, courseFilter.value || '');
            refreshGroupCodePreview();
        });

        groupModalEl.addEventListener('hidden.bs.modal', () => {
            groupForm.reset();
            groupForm.classList.remove('was-validated');
            groupIdEl.value = '';
            groupModalTitleEl.textContent = 'Новая группа';
            modalDirections = [];
            renderCourseOptions(groupEducationLevelEl.value, groupAcceleratedEl.checked);
            refreshGroupCodePreview();
        });

        groupFacultySelectEl.addEventListener('change', () => {
            loadDirectionsForModal(groupFacultySelectEl.value);
        });
        groupDirectionSelectEl.addEventListener('change', refreshGroupCodePreview);
        groupEducationFormEl.addEventListener('change', refreshGroupCodePreview);
        groupCourseEl.addEventListener('change', refreshGroupCodePreview);
        groupNumberEl.addEventListener('change', refreshGroupCodePreview);
        groupEducationLevelEl.addEventListener('change', () => {
            renderCourseOptions(groupEducationLevelEl.value, groupAcceleratedEl.checked);
            refreshGroupCodePreview();
        });
        groupAcceleratedEl.addEventListener('change', () => {
            renderCourseOptions(groupEducationLevelEl.value, groupAcceleratedEl.checked);
            refreshGroupCodePreview();
        });

        pageSizeSelect.addEventListener('change', () => {
            currentPage = 0;
            renderGroupsPage();
        });
        pageFirst.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage = 0;
                renderGroupsPage();
            }
        });
        pagePrev.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage -= 1;
                renderGroupsPage();
            }
        });
        pageNumbers.addEventListener('click', (event) => {
            const button = event.target.closest('[data-page-index]');
            if (!button) return;
            const targetPage = Number(button.dataset.pageIndex);
            if (!Number.isNaN(targetPage) && targetPage !== currentPage) {
                currentPage = targetPage;
                renderGroupsPage();
            }
        });
        pageNext.addEventListener('click', () => {
            if (currentPage < lastTotalPages - 1) {
                currentPage += 1;
                renderGroupsPage();
            }
        });
        pageLast.addEventListener('click', () => {
            if (lastTotalPages > 0 && currentPage < lastTotalPages - 1) {
                currentPage = lastTotalPages - 1;
                renderGroupsPage();
            }
        });

        facultyFilter.addEventListener('change', () => {
            loadDirectionsForFilters(facultyFilter.value).then(() => {
                directionFilter.value = '';
                currentPage = 0;
                loadGroups();
            });
        });
        directionFilter.addEventListener('change', () => {
            currentPage = 0;
            loadGroups();
        });
        courseFilter.addEventListener('change', () => {
            applyGroupsFiltersAndSort({resetPage: true});
        });
        if (educationLevelFilter) {
            educationLevelFilter.addEventListener('change', () => {
                renderCourseFilterOptions(
                    educationLevelFilter.value,
                    Boolean(acceleratedFilter?.checked)
                );
                applyGroupsFiltersAndSort({resetPage: true});
            });
        }
        if (educationFormFilter) {
            educationFormFilter.addEventListener('change', () => {
                applyGroupsFiltersAndSort({resetPage: true});
            });
        }
        if (acceleratedFilter) {
            acceleratedFilter.addEventListener('change', () => {
                renderCourseFilterOptions(
                    educationLevelFilter?.value || '',
                    Boolean(acceleratedFilter.checked)
                );
                applyGroupsFiltersAndSort({resetPage: true});
            });
        }
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                applyGroupsFiltersAndSort({resetPage: true});
            });
            searchEl.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyGroupsFiltersAndSort({resetPage: true});
                }
            });
        }
        sortEl.addEventListener('change', () => {
            applyGroupsFiltersAndSort({resetPage: true});
        });
        sortDirectionEl.addEventListener('change', () => {
            applyGroupsFiltersAndSort({resetPage: true});
        });
        document.getElementById('reloadGroups').addEventListener('click', () => {
            currentPage = 0;
            loadGroups();
        });
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                facultyFilter.value = '';
                directionFilter.value = '';
                courseFilter.value = '';
                if (educationLevelFilter) {
                    educationLevelFilter.value = '';
                }
                if (educationFormFilter) {
                    educationFormFilter.value = '';
                }
                if (acceleratedFilter) {
                    acceleratedFilter.checked = false;
                }
                if (searchEl) {
                    searchEl.value = '';
                }
                renderCourseFilterOptions('', false, '');
                sortEl.value = 'name';
                sortDirectionEl.value = 'asc';
                currentPage = 0;
                loadDirectionsForFilters().then(loadGroups).catch(err => toast(err.message, 'danger'));
            });
        }

        (async () => {
            renderCourseFilterOptions(
                educationLevelFilter?.value || '',
                Boolean(acceleratedFilter?.checked)
            );
            await loadFaculties();
            await loadDirectionsForFilters();
            await loadGroups();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Факультеты =====
    function initFacultiesPage() {
        const page = document.getElementById('facultiesPage');
        if (!page) return;

        const facultiesTable = document.getElementById('facultiesTable');
        const form = document.getElementById('facultyForm');
        const reloadBtn = document.getElementById('reloadFaculties');
        const pageSizeSelect = document.getElementById('facultiesPageSize');
        const pageFirst = document.getElementById('facultiesPageFirst');
        const pagePrev = document.getElementById('facultiesPagePrev');
        const pageNumbers = document.getElementById('facultiesPageNumbers');
        const pageNext = document.getElementById('facultiesPageNext');
        const pageLast = document.getElementById('facultiesPageLast');
        let faculties = [];
        let currentPage = 0;
        let lastTotalPages = 1;
        let facultyDeleteModalEl = null;
        let facultyDeleteModalInstance = null;
        const facultyDeleteState = {
            sourceFaculty: null,
            sourceDirections: [],
            sourceGroupsByDirection: new Map(),
            sourceStudentsByDirection: new Map(),
            targetDirections: [],
            targetGroupsByDirection: new Map(),
            selectedSourceDirectionId: null,
            selectedSourceGroupId: null,
            directionTargets: new Map(),
            assignments: new Map()
        };
        const facultyNameInput = document.getElementById('facultyName');
        const facultyShortNameInput = document.getElementById('facultyShortName');
        const facultyNameFeedback = form.querySelector('[data-field="name"]');

        const clearFacultyValidationError = () => {
            if (!facultyNameInput) return;
            facultyNameInput.setCustomValidity('');
            facultyNameInput.classList.remove('is-invalid');
            if (facultyNameFeedback) {
                facultyNameFeedback.textContent = 'Название факультета выглядит некорректно.';
                facultyNameFeedback.classList.remove('d-block');
            }
        };

        const syncFacultyValidationState = (forceValidation = false) => {
            if (!facultyNameInput) return '';
            const normalizedName = stripFacultyPrefix(facultyNameInput.value);
            if (!forceValidation && !normalizedName) {
                clearFacultyValidationError();
                return '';
            }
            const reason = validateFacultyName(normalizedName);
            if (reason) {
                facultyNameInput.setCustomValidity(reason);
                facultyNameInput.classList.add('is-invalid');
                if (facultyNameFeedback) {
                    facultyNameFeedback.textContent = reason;
                    if (forceValidation) {
                        facultyNameFeedback.classList.add('d-block');
                    }
                }
                return reason;
            }
            clearFacultyValidationError();
            return '';
        };

        const showFacultyValidationError = (message) => {
            if (!facultyNameInput) return;
            facultyNameInput.setCustomValidity(message || 'Некорректное значение');
            facultyNameInput.classList.add('is-invalid');
            if (facultyNameFeedback) {
                facultyNameFeedback.textContent = message || 'Некорректное значение';
                facultyNameFeedback.classList.add('d-block');
            }
            form.classList.add('was-validated');
            facultyNameInput.reportValidity();
        };

        const renderFacultiesPage = () => {
            const paged = paginateLocal(faculties, currentPage, Number(pageSizeSelect.value) || 10);
            currentPage = paged.page;
            lastTotalPages = paged.totalPages;
            const list = paged.content;

            facultiesTable.innerHTML = list.length === 0
                ? `<tr><td colspan="4" class="text-center text-muted py-4">Нет данных</td></tr>`
                : list.map(f => `<tr data-id="${f.id}">
                    <td class="col-name">${safeValue(formatFacultyName(f.name))}</td>
                    <td class="col-short">${safeValue(f.shortName)}</td>
                    <td class="col-short">${f.studentsCount ?? 0}</td>
                    <td class="text-end">
                        <div class="table-actions justify-content-end">
                            <button class="btn-circle" data-action="edit-faculty"><i class="bi bi-pencil"></i></button>
                            <button class="btn-circle text-danger" data-action="delete-faculty"><i class="bi bi-trash"></i></button>
                        </div>
                    </td>
                </tr>`).join('');
            bindFacultyActions();
            renderPaginationControls({
                page: currentPage,
                totalPages: lastTotalPages,
                firstBtn: pageFirst,
                prevBtn: pagePrev,
                numbersEl: pageNumbers,
                nextBtn: pageNext,
                lastBtn: pageLast
            });
        };

        const loadFaculties = async () => {
            faculties = mapFacultyForDisplay(await api('/api/faculties'))
                .sort((left, right) => (Number(right.id) || 0) - (Number(left.id) || 0));
            renderFacultiesPage();
        };

        const normalizeNumericId = (value) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : null;
        };

        const getStudentAssignmentKey = (studentOrId) => {
            const rawId = typeof studentOrId === 'object' && studentOrId !== null
                ? studentOrId.id
                : studentOrId;
            const numericId = normalizeNumericId(rawId);
            return numericId !== null ? numericId : String(rawId ?? '');
        };

        const getFacultyStudentsFlat = () => {
            const result = [];
            const seenKeys = new Set();
            facultyDeleteState.sourceStudentsByDirection.forEach((students) => {
                (students || []).forEach((student) => {
                    const key = getStudentAssignmentKey(student);
                    if (seenKeys.has(key)) {
                        return;
                    }
                    seenKeys.add(key);
                    result.push(student);
                });
            });
            return result;
        };

        const getFacultySourceGroupById = (directionId, groupId) => {
            const groups = facultyDeleteState.sourceGroupsByDirection.get(Number(directionId)) || [];
            return groups.find(group => Number(group.id) === Number(groupId)) || null;
        };

        const ensureFacultyDeleteModal = () => {
            if (facultyDeleteModalEl) {
                return;
            }
            const modalMarkup = document.createElement('div');
            modalMarkup.innerHTML = `
                <div class="modal fade" id="facultyDeleteTransferModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-xxl modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header border-0">
                                <h2 class="modal-title h5 mb-0">Удаление факультета с переводом студентов</h2>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning small mb-3">
                                    При удалении факультета будут удалены его направления, группы и учебные планы. Перед удалением назначьте направление и группу перевода каждому студенту.
                                </div>
                                <div class="row g-3">
                                    <div class="col-lg-4">
                                        <label class="form-label">Направление удаляемого факультета</label>
                                        <select class="form-select" id="facultyDeleteSourceDirection"></select>
                                    </div>
                                    <div class="col-lg-4">
                                        <label class="form-label">Направление перевода *</label>
                                        <select class="form-select" id="facultyDeleteTargetDirection"></select>
                                    </div>
                                    <div class="col-lg-4">
                                        <label class="form-label">Группа удаляемого направления</label>
                                        <select class="form-select" id="facultyDeleteSourceGroup"></select>
                                    </div>
                                </div>
                                <div class="small text-muted mt-2" id="facultyDeleteTransferSummary"></div>
                                <div class="table-responsive mt-3">
                                    <table class="table table-clean align-middle">
                                        <thead>
                                        <tr>
                                            <th style="width: 34%;">ФИО</th>
                                            <th style="width: 18%;">Направление</th>
                                            <th style="width: 18%;">Текущая группа</th>
                                            <th style="width: 30%;">Группа перевода</th>
                                        </tr>
                                        </thead>
                                        <tbody id="facultyDeleteStudentsBody">
                                        <tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="modal-footer border-0">
                                <button type="button" class="btn btn-outline-dark" data-bs-dismiss="modal">Отмена</button>
                                <button type="button" class="btn btn-danger" id="facultyDeleteConfirmBtn">Удалить факультет</button>
                            </div>
                        </div>
                    </div>
                </div>
            `.trim();
            document.body.appendChild(modalMarkup.firstElementChild);
            facultyDeleteModalEl = document.getElementById('facultyDeleteTransferModal');
            facultyDeleteModalInstance = new bootstrap.Modal(facultyDeleteModalEl);

            const sourceDirectionEl = document.getElementById('facultyDeleteSourceDirection');
            const targetDirectionEl = document.getElementById('facultyDeleteTargetDirection');
            const sourceGroupEl = document.getElementById('facultyDeleteSourceGroup');
            const confirmBtn = document.getElementById('facultyDeleteConfirmBtn');

            const collectUnassignedStudents = () => {
                const allStudents = getFacultyStudentsFlat();
                return allStudents.filter((student) => {
                    const assignmentKey = getStudentAssignmentKey(student);
                    return normalizeNumericId(facultyDeleteState.assignments.get(assignmentKey)) === null;
                });
            };

            const ensureFacultyAssignments = async () => {
                for (const direction of facultyDeleteState.sourceDirections) {
                    const sourceDirectionId = normalizeNumericId(direction.id);
                    if (sourceDirectionId === null) {
                        continue;
                    }
                    const targetDirectionId = normalizeNumericId(facultyDeleteState.directionTargets.get(sourceDirectionId));
                    if (targetDirectionId === null) {
                        return {
                            ok: false,
                            message: 'Для каждого направления удаляемого факультета нужно выбрать направление перевода.'
                        };
                    }
                    let targetGroups = facultyDeleteState.targetGroupsByDirection.get(targetDirectionId) || [];
                    if (targetGroups.length === 0) {
                        targetGroups = await api(`/api/groups?directionId=${targetDirectionId}`);
                        facultyDeleteState.targetGroupsByDirection.set(targetDirectionId, targetGroups);
                    }
                    if (targetGroups.length === 0) {
                        return {
                            ok: false,
                            message: `Для направления ${safeValue(direction.code)} ${safeValue(direction.name)} нет доступных групп перевода.`
                        };
                    }
                    const students = facultyDeleteState.sourceStudentsByDirection.get(sourceDirectionId) || [];
                    students.forEach((student) => {
                        const assignmentKey = getStudentAssignmentKey(student);
                        const assignedGroupId = normalizeNumericId(facultyDeleteState.assignments.get(assignmentKey));
                        const assignedGroupIsValid = assignedGroupId !== null
                            && targetGroups.some(group => normalizeNumericId(group.id) === assignedGroupId);
                        if (assignedGroupIsValid) {
                            return;
                        }
                        const sourceGroup = getFacultySourceGroupById(sourceDirectionId, student.groupId);
                        const preferred = pickPreferredTransferGroup(sourceGroup, targetGroups);
                        if (preferred && preferred.id != null) {
                            facultyDeleteState.assignments.set(assignmentKey, Number(preferred.id));
                        }
                    });
                }

                const unassignedStudents = collectUnassignedStudents();
                if (unassignedStudents.length > 0) {
                    return {
                        ok: false,
                        message: 'Для всех студентов должна быть выбрана группа перевода.'
                    };
                }
                return {ok: true};
            };

            const renderFacultyDeleteStudentsTable = async () => {
                const bodyEl = document.getElementById('facultyDeleteStudentsBody');
                const summaryEl = document.getElementById('facultyDeleteTransferSummary');
                const selectedDirectionId = Number(facultyDeleteState.selectedSourceDirectionId || 0);
                const selectedGroupId = Number(facultyDeleteState.selectedSourceGroupId || 0);
                const students = facultyDeleteState.sourceStudentsByDirection.get(selectedDirectionId) || [];
                const filteredStudents = selectedGroupId
                    ? students.filter(student => Number(student.groupId) === selectedGroupId)
                    : students;

                const targetDirectionId = Number(facultyDeleteState.directionTargets.get(selectedDirectionId) || 0);
                let targetGroups = [];
                if (targetDirectionId) {
                    targetGroups = facultyDeleteState.targetGroupsByDirection.get(targetDirectionId) || [];
                    if (targetGroups.length === 0) {
                        targetGroups = await api(`/api/groups?directionId=${targetDirectionId}`);
                        facultyDeleteState.targetGroupsByDirection.set(targetDirectionId, targetGroups);
                    }
                }

                const options = targetGroups.map(group => {
                    const label = `${group.code} (${group.course || '—'} курс)`;
                    return `<option value="${group.id}">${escapeHtml(label)}</option>`;
                }).join('');

                bodyEl.innerHTML = filteredStudents.length === 0
                    ? '<tr><td colspan="4" class="text-center text-muted py-3">Нет студентов в выбранной группе</td></tr>'
                    : filteredStudents.map((student) => {
                        const assignmentKey = getStudentAssignmentKey(student);
                        const assignedGroupId = facultyDeleteState.assignments.get(assignmentKey);
                        return `<tr data-student-id="${student.id}">
                            <td>${escapeHtml(student.fullName || '')}</td>
                            <td>${escapeHtml(student.directionName || '')}</td>
                            <td><span class="badge text-bg-light">${escapeHtml(safeValue(student.groupCode))}</span></td>
                            <td>
                                <select class="form-select form-select-sm faculty-delete-target-group">
                                    <option value="">Выберите группу</option>
                                    ${options}
                                </select>
                            </td>
                        </tr>`;
                    }).join('');

                bodyEl.querySelectorAll('.faculty-delete-target-group').forEach((selectEl) => {
                    const row = selectEl.closest('tr');
                    const studentId = row?.dataset.studentId;
                    const assignmentKey = getStudentAssignmentKey(studentId);
                    const assignedGroupId = facultyDeleteState.assignments.get(assignmentKey);
                    if (assignedGroupId && Array.from(selectEl.options).some(option => Number(option.value) === Number(assignedGroupId))) {
                        selectEl.value = String(assignedGroupId);
                    }
                    selectEl.addEventListener('change', () => {
                        const selected = selectEl.value ? Number(selectEl.value) : null;
                        if (selected) {
                            facultyDeleteState.assignments.set(assignmentKey, selected);
                        } else {
                            facultyDeleteState.assignments.delete(assignmentKey);
                        }
                        renderFacultyDeleteStudentsTable().catch(err => toast(err.message, 'danger'));
                    });
                });

                const allStudents = getFacultyStudentsFlat();
                const assignedCount = allStudents.filter((student) => {
                    const assignmentKey = getStudentAssignmentKey(student);
                    return normalizeNumericId(facultyDeleteState.assignments.get(assignmentKey)) !== null;
                }).length;
                if (summaryEl) {
                    summaryEl.textContent = `Назначено переводов: ${assignedCount} из ${allStudents.length}`;
                }
                if (confirmBtn) {
                    // Keep action available and show detailed validation message on click.
                    confirmBtn.disabled = false;
                }
            };

            const refreshSourceGroups = async () => {
                const selectedDirectionId = Number(facultyDeleteState.selectedSourceDirectionId || 0);
                const groups = facultyDeleteState.sourceGroupsByDirection.get(selectedDirectionId) || [];
                sourceGroupEl.innerHTML = groups.length === 0
                    ? '<option value="">Нет групп</option>'
                    : groups.map(group => `<option value="${group.id}">${escapeHtml(group.code)}</option>`).join('');
                facultyDeleteState.selectedSourceGroupId = groups.length > 0 ? Number(groups[0].id) : null;
                sourceGroupEl.value = facultyDeleteState.selectedSourceGroupId ? String(facultyDeleteState.selectedSourceGroupId) : '';
                await renderFacultyDeleteStudentsTable();
            };

            const autoAssignForDirection = async (sourceDirectionId) => {
                const targetDirectionId = Number(facultyDeleteState.directionTargets.get(sourceDirectionId) || 0);
                if (!targetDirectionId) {
                    return;
                }
                let targetGroups = facultyDeleteState.targetGroupsByDirection.get(targetDirectionId) || [];
                if (targetGroups.length === 0) {
                    targetGroups = await api(`/api/groups?directionId=${targetDirectionId}`);
                    facultyDeleteState.targetGroupsByDirection.set(targetDirectionId, targetGroups);
                }
                const students = facultyDeleteState.sourceStudentsByDirection.get(sourceDirectionId) || [];
                students.forEach((student) => {
                    const sourceGroup = getFacultySourceGroupById(sourceDirectionId, student.groupId);
                    const preferred = pickPreferredTransferGroup(sourceGroup, targetGroups);
                    if (preferred) {
                        const assignmentKey = getStudentAssignmentKey(student);
                        facultyDeleteState.assignments.set(assignmentKey, preferred.id);
                    }
                });
            };

            sourceDirectionEl.addEventListener('change', () => {
                facultyDeleteState.selectedSourceDirectionId = sourceDirectionEl.value ? Number(sourceDirectionEl.value) : null;
                const targetDirectionId = Number(facultyDeleteState.directionTargets.get(facultyDeleteState.selectedSourceDirectionId) || 0);
                targetDirectionEl.value = targetDirectionId ? String(targetDirectionId) : '';
                refreshSourceGroups().catch(err => toast(err.message, 'danger'));
            });

            targetDirectionEl.addEventListener('change', () => {
                const sourceDirectionId = Number(facultyDeleteState.selectedSourceDirectionId || 0);
                if (!sourceDirectionId) return;
                const selectedTargetDirectionId = targetDirectionEl.value ? Number(targetDirectionEl.value) : null;
                if (selectedTargetDirectionId) {
                    facultyDeleteState.directionTargets.set(sourceDirectionId, selectedTargetDirectionId);
                } else {
                    facultyDeleteState.directionTargets.delete(sourceDirectionId);
                }
                autoAssignForDirection(sourceDirectionId)
                    .then(() => renderFacultyDeleteStudentsTable())
                    .catch(err => toast(err.message, 'danger'));
            });

            sourceGroupEl.addEventListener('change', () => {
                facultyDeleteState.selectedSourceGroupId = sourceGroupEl.value ? Number(sourceGroupEl.value) : null;
                renderFacultyDeleteStudentsTable().catch(err => toast(err.message, 'danger'));
            });

            confirmBtn.addEventListener('click', async () => {
                try {
                    if (!facultyDeleteState.sourceFaculty) return;
                    const allStudents = getFacultyStudentsFlat();
                    if (allStudents.length === 0) {
                        if (await confirmAction({
                            title: 'Удаление факультета',
                            message: 'Удалить факультет? Направления, группы и учебные планы этого факультета будут удалены каскадно.',
                            confirmText: 'Удалить'
                        })) {
                            await withButtonLoading(confirmBtn, 'Удаляем факультет...', async () => {
                                await api(`/api/faculties/${facultyDeleteState.sourceFaculty.id}`, {method: 'DELETE'});
                            });
                            facultyDeleteModalInstance.hide();
                            toast('Факультет удалён');
                            await loadFaculties();
                        }
                        return;
                    }

                    const assignmentState = await ensureFacultyAssignments();
                    if (!assignmentState.ok) {
                        toast(assignmentState.message || 'Не удалось подготовить переводы студентов.', 'danger');
                        await renderFacultyDeleteStudentsTable();
                        return;
                    }

                    const payload = {
                        assignments: allStudents.map(student => ({
                            studentId: Number(student.id),
                            targetGroupId: Number(facultyDeleteState.assignments.get(getStudentAssignmentKey(student)))
                        }))
                    };
                    await withButtonLoading(confirmBtn, 'Переводим студентов и удаляем...', async () => {
                        await api(`/api/faculties/${facultyDeleteState.sourceFaculty.id}/delete-with-transfer`, {
                            method: 'POST',
                            body: JSON.stringify(payload)
                        });
                    });
                    facultyDeleteModalInstance.hide();
                    toast('Факультет удалён, студенты переведены');
                    await loadFaculties();
                } catch (error) {
                    toast(error?.message || 'Не удалось удалить факультет.', 'danger');
                }
            });

            facultyDeleteModalEl.addEventListener('hidden.bs.modal', () => {
                facultyDeleteState.sourceFaculty = null;
                facultyDeleteState.sourceDirections = [];
                facultyDeleteState.sourceGroupsByDirection.clear();
                facultyDeleteState.sourceStudentsByDirection.clear();
                facultyDeleteState.targetDirections = [];
                facultyDeleteState.targetGroupsByDirection.clear();
                facultyDeleteState.selectedSourceDirectionId = null;
                facultyDeleteState.selectedSourceGroupId = null;
                facultyDeleteState.directionTargets.clear();
                facultyDeleteState.assignments.clear();
            });
        };

        const openFacultyDeleteModal = async (faculty) => {
            ensureFacultyDeleteModal();
            facultyDeleteState.sourceFaculty = faculty;
            facultyDeleteState.sourceDirections = await api(`/api/directions?facultyId=${faculty.id}`);
            facultyDeleteState.targetDirections = (await api('/api/directions'))
                .filter(direction => Number(direction.facultyId) !== Number(faculty.id));
            facultyDeleteState.sourceGroupsByDirection.clear();
            facultyDeleteState.sourceStudentsByDirection.clear();
            facultyDeleteState.targetGroupsByDirection.clear();
            facultyDeleteState.directionTargets.clear();
            facultyDeleteState.assignments.clear();

            if (facultyDeleteState.sourceDirections.length === 0) {
                if (await confirmAction({
                    title: 'Удаление факультета',
                    message: 'Удалить факультет? У него нет направлений.',
                    confirmText: 'Удалить'
                })) {
                    await api(`/api/faculties/${faculty.id}`, {method: 'DELETE'});
                    toast('Факультет удалён');
                    await loadFaculties();
                }
                return;
            }

            const directionDatasets = await Promise.all(facultyDeleteState.sourceDirections.map(async (direction) => {
                const [groups, students] = await Promise.all([
                    api(`/api/groups?directionId=${direction.id}`),
                    api(`/api/students?directionId=${direction.id}`)
                ]);
                return {direction, groups, students};
            }));
            directionDatasets.forEach((dataset) => {
                const directionId = Number(dataset.direction.id);
                facultyDeleteState.sourceGroupsByDirection.set(directionId, dataset.groups || []);
                facultyDeleteState.sourceStudentsByDirection.set(directionId, dataset.students || []);
            });

            const allStudents = getFacultyStudentsFlat();
            if (allStudents.length === 0) {
                if (await confirmAction({
                    title: 'Удаление факультета',
                    message: 'Удалить факультет? Направления, группы и учебные планы этого факультета будут удалены каскадно.',
                    confirmText: 'Удалить'
                })) {
                    await api(`/api/faculties/${faculty.id}`, {method: 'DELETE'});
                    toast('Факультет удалён');
                    await loadFaculties();
                }
                return;
            }

            if (facultyDeleteState.targetDirections.length === 0) {
                toast('Нет направлений в других факультетах для перевода студентов.', 'danger');
                return;
            }

            const sourceDirectionEl = document.getElementById('facultyDeleteSourceDirection');
            const targetDirectionEl = document.getElementById('facultyDeleteTargetDirection');
            sourceDirectionEl.innerHTML = facultyDeleteState.sourceDirections
                .map(direction => `<option value="${direction.id}">${escapeHtml(direction.code)} ${escapeHtml(direction.name)}</option>`)
                .join('');
            targetDirectionEl.innerHTML = `<option value="">Выберите направление</option>${facultyDeleteState.targetDirections
                .map(direction => `<option value="${direction.id}">${escapeHtml(direction.code)} ${escapeHtml(direction.name)}</option>`)
                .join('')}`;

            facultyDeleteState.sourceDirections.forEach((direction) => {
                const defaultTarget = facultyDeleteState.targetDirections[0];
                if (defaultTarget) {
                    facultyDeleteState.directionTargets.set(Number(direction.id), Number(defaultTarget.id));
                }
            });

            for (const direction of facultyDeleteState.sourceDirections) {
                // eslint-disable-next-line no-await-in-loop
                await (async () => {
                    const sourceDirectionId = Number(direction.id);
                    const targetDirectionId = Number(facultyDeleteState.directionTargets.get(sourceDirectionId) || 0);
                    if (!targetDirectionId) return;
                    let targetGroups = facultyDeleteState.targetGroupsByDirection.get(targetDirectionId) || [];
                    if (targetGroups.length === 0) {
                        targetGroups = await api(`/api/groups?directionId=${targetDirectionId}`);
                        facultyDeleteState.targetGroupsByDirection.set(targetDirectionId, targetGroups);
                    }
                    const students = facultyDeleteState.sourceStudentsByDirection.get(sourceDirectionId) || [];
                    students.forEach((student) => {
                        const sourceGroup = getFacultySourceGroupById(sourceDirectionId, student.groupId);
                        const preferred = pickPreferredTransferGroup(sourceGroup, targetGroups);
                        if (preferred) {
                            facultyDeleteState.assignments.set(getStudentAssignmentKey(student), preferred.id);
                        }
                    });
                })();
            }

            facultyDeleteState.selectedSourceDirectionId = Number(facultyDeleteState.sourceDirections[0].id);
            sourceDirectionEl.value = String(facultyDeleteState.selectedSourceDirectionId);
            targetDirectionEl.value = String(facultyDeleteState.directionTargets.get(facultyDeleteState.selectedSourceDirectionId) || '');
            const groups = facultyDeleteState.sourceGroupsByDirection.get(facultyDeleteState.selectedSourceDirectionId) || [];
            facultyDeleteState.selectedSourceGroupId = groups.length > 0 ? Number(groups[0].id) : null;
            const sourceGroupEl = document.getElementById('facultyDeleteSourceGroup');
            sourceGroupEl.innerHTML = groups.length === 0
                ? '<option value="">Нет групп</option>'
                : groups.map(group => `<option value="${group.id}">${escapeHtml(group.code)}</option>`).join('');
            sourceGroupEl.value = facultyDeleteState.selectedSourceGroupId ? String(facultyDeleteState.selectedSourceGroupId) : '';

            const event = new Event('change');
            sourceDirectionEl.dispatchEvent(event);
            facultyDeleteModalInstance.show();
        };

        const bindFacultyActions = () => {
            facultiesTable.querySelectorAll('[data-action="edit-faculty"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const row = e.currentTarget.closest('tr');
                    const id = row.dataset.id;
                    const faculty = faculties.find(f => f.id == id);
                    document.getElementById('facultyModalTitle').textContent = 'Редактирование факультета';
                    document.getElementById('facultyId').value = faculty.id;
                    clearFacultyValidationError();
                    facultyNameInput.value = stripFacultyPrefix(faculty.name);
                    if (facultyShortNameInput) {
                        facultyShortNameInput.value = normalizeFacultyShortName(safeValue(faculty.shortName));
                        setFacultyShortNameManualFlag(facultyNameInput, facultyShortNameInput);
                    }
                    new bootstrap.Modal(document.getElementById('facultyModal')).show();
                });
            });
            facultiesTable.querySelectorAll('[data-action="delete-faculty"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const faculty = faculties.find(item => String(item.id) === String(id));
                    if (!faculty) return;
                    openFacultyDeleteModal(faculty).catch(err => toast(err.message, 'danger'));
                });
            });
        };

        document.getElementById('saveFacultyBtn').addEventListener('click', async () => {
            clearFacultyValidationError();
            const normalizedName = stripFacultyPrefix(facultyNameInput.value);
            const localValidationMessage = syncFacultyValidationState(true);
            if (localValidationMessage) {
                showFacultyValidationError(localValidationMessage);
                toast(localValidationMessage, 'danger');
                return;
            }
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                const reason = getFacultyValidationReason(facultyNameInput);
                showFacultyValidationError(reason);
                toast(reason, 'danger');
                return;
            }
            const payload = {
                name: normalizedName,
                shortName: String(facultyShortNameInput?.value || '').trim()
            };
            const id = document.getElementById('facultyId').value;
            const url = id ? `/api/faculties/${id}` : '/api/faculties';
            const method = id ? 'PUT' : 'POST';
            try {
                await api(url, {method, body: JSON.stringify(payload)});
                bootstrap.Modal.getInstance(document.getElementById('facultyModal')).hide();
                toast('Сохранено');
                form.reset();
                form.classList.remove('was-validated');
                document.getElementById('facultyId').value = '';
                await loadFaculties();
            } catch (error) {
                const validationPayload = (error && error.payload && typeof error.payload === 'object') ? error.payload : null;
                const validationMessage = validationPayload?.name
                    || validationPayload?.shortName
                    || error?.message
                    || 'Не удалось сохранить данные.';
                if (validationPayload?.name) {
                    showFacultyValidationError(validationPayload.name);
                }
                toast(validationMessage, 'danger');
            }
        });

        document.getElementById('facultyModal').addEventListener('hidden.bs.modal', () => {
            form.reset();
            form.classList.remove('was-validated');
            clearFacultyValidationError();
            document.getElementById('facultyId').value = '';
            document.getElementById('facultyModalTitle').textContent = 'Новый факультет';
            if (facultyShortNameInput) {
                facultyShortNameInput.dataset.shortNameManual = 'false';
            }
        });
        document.getElementById('facultyModal').addEventListener('show.bs.modal', () => {
            if (document.getElementById('facultyId').value) {
                return;
            }
            applyFacultyShortNameAuto(facultyNameInput, facultyShortNameInput, true);
        });
        if (facultyNameInput && facultyShortNameInput) {
            facultyNameInput.addEventListener('input', () => {
                applyFacultyShortNameAuto(facultyNameInput, facultyShortNameInput);
                syncFacultyValidationState(false);
            });
            facultyShortNameInput.addEventListener('input', () => {
                setFacultyShortNameManualFlag(facultyNameInput, facultyShortNameInput);
            });
        }

        pageSizeSelect.addEventListener('change', () => {
            currentPage = 0;
            renderFacultiesPage();
        });
        pageFirst.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage = 0;
                renderFacultiesPage();
            }
        });
        pagePrev.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage -= 1;
                renderFacultiesPage();
            }
        });
        pageNumbers.addEventListener('click', (event) => {
            const button = event.target.closest('[data-page-index]');
            if (!button) return;
            const targetPage = Number(button.dataset.pageIndex);
            if (!Number.isNaN(targetPage) && targetPage !== currentPage) {
                currentPage = targetPage;
                renderFacultiesPage();
            }
        });
        pageNext.addEventListener('click', () => {
            if (currentPage < lastTotalPages - 1) {
                currentPage += 1;
                renderFacultiesPage();
            }
        });
        pageLast.addEventListener('click', () => {
            if (lastTotalPages > 0 && currentPage < lastTotalPages - 1) {
                currentPage = lastTotalPages - 1;
                renderFacultiesPage();
            }
        });
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                currentPage = 0;
                loadFaculties().catch(err => toast(err.message, 'danger'));
            });
        }

        loadFaculties().catch(err => toast(err.message, 'danger'));
    }

    // ===== Направления и факультеты =====
    function initDirectionsPage() {
        const page = document.getElementById('directionsPage');
        if (!page) return;

        const directionsTable = document.getElementById('directionsTable');
        const directionsCount = document.getElementById('directionsCount');
        const searchEl = document.getElementById('directionSearch');
        const facultyFilter = document.getElementById('directionFacultyFilter');
        const sortEl = document.getElementById('directionSort');
        const sortDirectionEl = document.getElementById('directionSortDirection');
        const reloadBtn = document.getElementById('reloadDirections');
        const resetFiltersBtn = document.getElementById('resetDirectionFilters');
        const directionsPageSizeSelect = document.getElementById('directionsPageSize');
        const directionsPageFirst = document.getElementById('directionsPageFirst');
        const directionsPagePrev = document.getElementById('directionsPagePrev');
        const directionsPageNumbers = document.getElementById('directionsPageNumbers');
        const directionsPageNext = document.getElementById('directionsPageNext');
        const directionsPageLast = document.getElementById('directionsPageLast');
        const directionModalEl = document.getElementById('directionModal');
        const directionIdEl = document.getElementById('directionId');
        const directionCodeEl = document.getElementById('directionCode');
        const directionAnnualTuitionEl = document.getElementById('directionAnnualTuition');
        const directionFacultySelectEl = document.getElementById('directionFaculty');

        let faculties = [];
        let sourceDirections = [];
        let directions = [];
        let directionsCurrentPage = 0;
        let directionsLastTotalPages = 1;
        let directionDeleteModalEl = null;
        let directionDeleteModalInstance = null;
        const directionDeleteState = {
            sourceDirection: null,
            sourceGroups: [],
            sourceStudents: [],
            targetDirections: [],
            targetGroups: [],
            targetDirectionId: null,
            selectedSourceGroupId: null,
            assignments: new Map()
        };
        const facultyForm = document.getElementById('facultyForm');
        const directionForm = document.getElementById('directionForm');
        const facultyNameInput = document.getElementById('facultyName');
        const facultyShortNameInput = document.getElementById('facultyShortName');
        const facultyNameFeedback = facultyForm ? facultyForm.querySelector('[data-field="name"]') : null;
        const directionNameInput = document.getElementById('directionName');
        const directionShortNameInput = document.getElementById('directionShortName');
        const directionNameFeedback = directionForm ? directionForm.querySelector('[data-field="direction-name"]') : null;
        const directionAnnualTuitionFeedback = directionForm ? directionForm.querySelector('[data-field="annual-tuition"]') : null;

        const clearFacultyValidationError = () => {
            if (!facultyNameInput) return;
            facultyNameInput.setCustomValidity('');
            facultyNameInput.classList.remove('is-invalid');
            if (facultyNameFeedback) {
                facultyNameFeedback.textContent = 'Название факультета выглядит некорректно.';
                facultyNameFeedback.classList.remove('d-block');
            }
        };

        const syncFacultyValidationState = (forceValidation = false) => {
            if (!facultyNameInput) return '';
            const normalizedName = stripFacultyPrefix(facultyNameInput.value);
            if (!forceValidation && !normalizedName) {
                clearFacultyValidationError();
                return '';
            }
            const reason = validateFacultyName(normalizedName);
            if (reason) {
                facultyNameInput.setCustomValidity(reason);
                facultyNameInput.classList.add('is-invalid');
                if (facultyNameFeedback) {
                    facultyNameFeedback.textContent = reason;
                    if (forceValidation) {
                        facultyNameFeedback.classList.add('d-block');
                    }
                }
                return reason;
            }
            clearFacultyValidationError();
            return '';
        };

        const showFacultyValidationError = (message) => {
            if (!facultyNameInput) return;
            facultyNameInput.setCustomValidity(message || 'Некорректное значение');
            facultyNameInput.classList.add('is-invalid');
            if (facultyNameFeedback) {
                facultyNameFeedback.textContent = message || 'Некорректное значение';
                facultyNameFeedback.classList.add('d-block');
            }
            facultyForm.classList.add('was-validated');
            facultyNameInput.reportValidity();
        };

        const clearDirectionValidationError = () => {
            if (!directionNameInput) return;
            directionNameInput.setCustomValidity('');
            directionNameInput.classList.remove('is-invalid');
            if (directionNameFeedback) {
                directionNameFeedback.textContent = 'Название направления выглядит некорректно.';
                directionNameFeedback.classList.remove('d-block');
            }
        };
        const clearDirectionAnnualTuitionValidationError = () => {
            if (!directionAnnualTuitionEl) return;
            directionAnnualTuitionEl.setCustomValidity('');
            directionAnnualTuitionEl.classList.remove('is-invalid');
            if (directionAnnualTuitionFeedback) {
                directionAnnualTuitionFeedback.textContent = 'Размер оплаты выглядит некорректно.';
                directionAnnualTuitionFeedback.classList.remove('d-block');
            }
        };

        const syncDirectionValidationState = (forceValidation = false) => {
            if (!directionNameInput) return '';
            const normalizedDirectionName = normalizeDirectionName(directionNameInput.value);
            if (!forceValidation && !normalizedDirectionName) {
                clearDirectionValidationError();
                return '';
            }
            const reason = validateDirectionName(normalizedDirectionName);
            if (reason) {
                directionNameInput.setCustomValidity(reason);
                directionNameInput.classList.add('is-invalid');
                if (directionNameFeedback) {
                    directionNameFeedback.textContent = reason;
                    if (forceValidation) {
                        directionNameFeedback.classList.add('d-block');
                    }
                }
                return reason;
            }
            clearDirectionValidationError();
            return '';
        };

        const showDirectionValidationError = (message) => {
            if (!directionNameInput) return;
            directionNameInput.setCustomValidity(message || 'Некорректное значение');
            directionNameInput.classList.add('is-invalid');
            if (directionNameFeedback) {
                directionNameFeedback.textContent = message || 'Некорректное значение';
                directionNameFeedback.classList.add('d-block');
            }
            if (directionForm) {
                directionForm.classList.add('was-validated');
            }
            directionNameInput.reportValidity();
        };
        const validateDirectionAnnualTuitionValue = (value) => {
            const raw = String(value || '').replace(/\u00A0/g, ' ').trim();
            if (!raw) {
                return '';
            }
            if (/[^0-9\s.,]/.test(raw)) {
                return 'Размер оплаты выглядит некорректно.';
            }
            const parsed = parseMoneyParts(raw);
            if (!parsed) {
                return 'Размер оплаты выглядит некорректно.';
            }
            const integerDigits = String(parsed.integerPart || '').replace(/\D/g, '');
            if (integerDigits.length > 8) {
                return 'Размер оплаты должен содержать не более 8 цифр.';
            }
            return '';
        };
        const getDirectionAnnualTuitionValidationReason = (inputEl) => {
            const semanticReason = validateDirectionAnnualTuitionValue(inputEl?.value || '');
            if (semanticReason) {
                return semanticReason;
            }
            if (!inputEl) {
                return 'Некорректный размер оплаты.';
            }
            if (inputEl.validity?.patternMismatch) {
                return 'Размер оплаты выглядит некорректно.';
            }
            return inputEl.validationMessage || 'Некорректный размер оплаты.';
        };
        const syncDirectionAnnualTuitionValidationState = (forceValidation = false) => {
            if (!directionAnnualTuitionEl) return '';
            const reason = validateDirectionAnnualTuitionValue(directionAnnualTuitionEl.value);
            if (reason) {
                directionAnnualTuitionEl.setCustomValidity(reason);
                directionAnnualTuitionEl.classList.add('is-invalid');
                if (directionAnnualTuitionFeedback) {
                    directionAnnualTuitionFeedback.textContent = reason;
                    if (forceValidation) {
                        directionAnnualTuitionFeedback.classList.add('d-block');
                    }
                }
                return reason;
            }
            clearDirectionAnnualTuitionValidationError();
            return '';
        };
        const showDirectionAnnualTuitionValidationError = (message) => {
            if (!directionAnnualTuitionEl) return;
            directionAnnualTuitionEl.setCustomValidity(message || 'Некорректное значение');
            directionAnnualTuitionEl.classList.add('is-invalid');
            if (directionAnnualTuitionFeedback) {
                directionAnnualTuitionFeedback.textContent = message || 'Некорректное значение';
                directionAnnualTuitionFeedback.classList.add('d-block');
            }
            if (directionForm) {
                directionForm.classList.add('was-validated');
            }
            directionAnnualTuitionEl.reportValidity();
        };

        const renderSelect = (selectEl, list, placeholder) => {
            if (!selectEl) return;
            const previousValue = selectEl.value;
            const opts = [`<option value="">${placeholder}</option>`]
                .concat(list.map(item => `<option value="${item.id}">${item.displayName || item.name || item.code}</option>`));
            selectEl.innerHTML = opts.join('');
            if (previousValue && Array.from(selectEl.options).some(option => option.value === String(previousValue))) {
                selectEl.value = String(previousValue);
            }
        };

        const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), 'ru-RU', {
            numeric: true,
            sensitivity: 'base'
        });

        const normalizeAnnualTuition = (value) => normalizeMoneyForApi(value);

        const formatAnnualTuition = (value) => formatMoneyInput(value, {emptyAsBlank: true});

        const applyAnnualTuitionMask = (typing = false) => {
            if (!directionAnnualTuitionEl) return;
            applyMoneyMaskWithCaret(directionAnnualTuitionEl, {
                emptyAsBlank: true,
                formatter: typing ? formatMoneyInputForTyping : undefined
            });
        };

        const formatDirectionCode = (value) => {
            const digits = String(value || '').replace(/\D/g, '').slice(0, 6);
            if (digits.length <= 2) return digits;
            if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
            return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 6)}`;
        };

        const applyDirectionCodeMask = () => {
            if (!directionCodeEl) return;
            directionCodeEl.value = formatDirectionCode(directionCodeEl.value);
        };

        const sortDirections = (list) => {
            const mode = sortEl.value || 'createdAt';
            const directionFactor = sortDirectionEl.value === 'desc' ? -1 : 1;
            return [...list].sort((left, right) => {
                let cmp = 0;
                if (mode === 'createdAt') {
                    const leftCreatedAt = Date.parse(left.createdAt || '');
                    const rightCreatedAt = Date.parse(right.createdAt || '');
                    const leftCreatedAtSafe = Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0;
                    const rightCreatedAtSafe = Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0;
                    cmp = leftCreatedAtSafe - rightCreatedAtSafe;
                } else if (mode === 'code') {
                    cmp = compareText(left.code, right.code);
                } else if (mode === 'faculty') {
                    cmp = compareText(left.facultyName, right.facultyName);
                    if (cmp === 0) {
                        cmp = compareText(left.name, right.name);
                    }
                } else {
                    cmp = compareText(left.name, right.name);
                }

                if (cmp === 0 && mode === 'createdAt') {
                    cmp = (Number(left.id) || 0) - (Number(right.id) || 0);
                }
                if (cmp === 0) {
                    cmp = compareText(left.name, right.name);
                }
                if (cmp === 0) {
                    cmp = compareText(left.code, right.code);
                }
                if (cmp === 0) {
                    cmp = (Number(left.id) || 0) - (Number(right.id) || 0);
                }
                return cmp * directionFactor;
            });
        };

        const loadFaculties = async () => {
            faculties = mapFacultyForDisplay(await api('/api/faculties'));
            renderSelect(facultyFilter, faculties, 'Все');
            renderSelect(document.getElementById('directionFaculty'), faculties, 'Факультет');
        };

        const renderDirectionsPage = () => {
            const paged = paginateLocal(directions, directionsCurrentPage, Number(directionsPageSizeSelect.value) || 10);
            directionsCurrentPage = paged.page;
            directionsLastTotalPages = paged.totalPages;
            const list = paged.content;

            directionsTable.innerHTML = list.length === 0
                ? `<tr><td colspan="7" class="text-center text-muted py-4">Нет данных</td></tr>`
                : list.map(d => `<tr data-id="${d.id}">
                    <td class="fw-semibold col-code">${d.code}</td>
                    <td class="col-short">${safeValue(d.shortName)}</td>
                    <td class="col-name">${d.name}</td>
                    <td class="col-faculty">${safeValue(formatFacultyName(d.facultyName))}</td>
                    <td class="col-tuition">${safeValue(formatAnnualTuition(d.annualTuition))}</td>
                    <td class="col-students">${d.studentsCount ?? 0}</td>
                    <td class="text-end">
                        <div class="table-actions justify-content-end">
                            <button class="btn-circle" data-action="edit-direction"><i class="bi bi-pencil"></i></button>
                            <button class="btn-circle text-danger" data-action="delete-direction"><i class="bi bi-trash"></i></button>
                        </div>
                    </td>
                </tr>`).join('');
            bindDirectionActions();
            renderPaginationControls({
                page: directionsCurrentPage,
                totalPages: directionsLastTotalPages,
                firstBtn: directionsPageFirst,
                prevBtn: directionsPagePrev,
                numbersEl: directionsPageNumbers,
                nextBtn: directionsPageNext,
                lastBtn: directionsPageLast
            });
        };

        const applyDirectionsFiltersAndSort = ({resetPage = false} = {}) => {
            const query = String(searchEl?.value || '').trim().toLowerCase();
            const filtered = query
                ? sourceDirections.filter(direction => {
                    const haystack = [
                        direction.code,
                        direction.shortName,
                        direction.name,
                        formatFacultyName(direction.facultyName)
                    ].map(value => String(safeValue(value)).toLowerCase());
                    return haystack.some(value => value.includes(query));
                })
                : [...sourceDirections];
            directions = sortDirections(filtered);
            if (resetPage) {
                directionsCurrentPage = 0;
            }
            directionsCount.textContent = directions.length;
            renderDirectionsPage();
        };

        const loadDirections = async () => {
            const params = facultyFilter.value ? `?facultyId=${facultyFilter.value}` : '';
            sourceDirections = await api('/api/directions' + params);
            applyDirectionsFiltersAndSort({resetPage: true});
        };

        const getDirectionSourceGroupById = (groupId) => {
            const normalized = Number(groupId);
            return directionDeleteState.sourceGroups.find(group => Number(group.id) === normalized) || null;
        };

        const ensureDirectionDeleteModal = () => {
            if (directionDeleteModalEl) {
                return;
            }
            const modalMarkup = document.createElement('div');
            modalMarkup.innerHTML = `
                <div class="modal fade" id="directionDeleteTransferModal" tabindex="-1" aria-hidden="true">
                    <div class="modal-dialog modal-xxl modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header border-0">
                                <h2 class="modal-title h5 mb-0">Удаление направления с переводом студентов</h2>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning small mb-3">
                                    При удалении направления его группы и учебные планы будут удалены каскадно. До удаления нужно назначить группу перевода каждому студенту.
                                </div>
                                <div class="row g-3">
                                    <div class="col-lg-6">
                                        <label class="form-label">Направление перевода *</label>
                                        <select class="form-select" id="directionDeleteTargetDirection"></select>
                                    </div>
                                    <div class="col-lg-6">
                                        <label class="form-label">Группа удаляемого направления</label>
                                        <select class="form-select" id="directionDeleteSourceGroup"></select>
                                    </div>
                                </div>
                                <div class="small text-muted mt-2" id="directionDeleteTransferSummary"></div>
                                <div class="table-responsive mt-3">
                                    <table class="table table-clean align-middle">
                                        <thead>
                                        <tr>
                                            <th style="width: 38%;">ФИО</th>
                                            <th style="width: 22%;">Текущая группа</th>
                                            <th style="width: 40%;">Группа перевода</th>
                                        </tr>
                                        </thead>
                                        <tbody id="directionDeleteStudentsBody">
                                        <tr><td colspan="3" class="text-center text-muted py-3">Нет студентов</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="modal-footer border-0">
                                <button type="button" class="btn btn-outline-dark" data-bs-dismiss="modal">Отмена</button>
                                <button type="button" class="btn btn-danger" id="directionDeleteConfirmBtn">Удалить направление</button>
                            </div>
                        </div>
                    </div>
                </div>
            `.trim();
            document.body.appendChild(modalMarkup.firstElementChild);
            directionDeleteModalEl = document.getElementById('directionDeleteTransferModal');
            directionDeleteModalInstance = new bootstrap.Modal(directionDeleteModalEl);

            const targetDirectionEl = document.getElementById('directionDeleteTargetDirection');
            const sourceGroupEl = document.getElementById('directionDeleteSourceGroup');
            const confirmBtn = document.getElementById('directionDeleteConfirmBtn');

            targetDirectionEl.addEventListener('change', async () => {
                directionDeleteState.targetDirectionId = targetDirectionEl.value ? Number(targetDirectionEl.value) : null;
                directionDeleteState.targetGroups = [];
                if (directionDeleteState.targetDirectionId) {
                    directionDeleteState.targetGroups = await api(`/api/groups?directionId=${directionDeleteState.targetDirectionId}`);
                }
                if (directionDeleteState.targetGroups.length > 0) {
                    directionDeleteState.sourceStudents.forEach((student) => {
                        const sourceGroup = getDirectionSourceGroupById(student.groupId);
                        const preferred = pickPreferredTransferGroup(sourceGroup, directionDeleteState.targetGroups);
                        if (preferred) {
                            directionDeleteState.assignments.set(student.id, preferred.id);
                        }
                    });
                } else {
                    directionDeleteState.assignments.clear();
                }
                renderDirectionDeleteStudentsTable();
            });

            sourceGroupEl.addEventListener('change', () => {
                directionDeleteState.selectedSourceGroupId = sourceGroupEl.value ? Number(sourceGroupEl.value) : null;
                renderDirectionDeleteStudentsTable();
            });

            confirmBtn.addEventListener('click', async () => {
                try {
                    if (!directionDeleteState.sourceDirection) return;
                    if (!directionDeleteState.sourceStudents.length) {
                        if (await confirmAction({
                            title: 'Удаление направления',
                            message: 'Удалить направление? Группы и учебные планы направления будут удалены каскадно.',
                            confirmText: 'Удалить'
                        })) {
                            await withButtonLoading(confirmBtn, 'Удаляем направление...', async () => {
                                await api(`/api/directions/${directionDeleteState.sourceDirection.id}`, {method: 'DELETE'});
                            });
                            directionDeleteModalInstance.hide();
                            toast('Направление удалено');
                            await loadDirections();
                        }
                        return;
                    }
                    if (!directionDeleteState.targetDirectionId) {
                        toast('Выберите направление перевода.', 'danger');
                        return;
                    }
                    if (directionDeleteState.targetGroups.length === 0) {
                        toast('У выбранного направления перевода нет групп.', 'danger');
                        return;
                    }
                    const missing = directionDeleteState.sourceStudents.some(student => !directionDeleteState.assignments.get(student.id));
                    if (missing) {
                        toast('Для всех студентов должна быть выбрана группа перевода.', 'danger');
                        return;
                    }

                    const payload = {
                        targetDirectionId: directionDeleteState.targetDirectionId,
                        assignments: directionDeleteState.sourceStudents.map(student => ({
                            studentId: student.id,
                            targetGroupId: Number(directionDeleteState.assignments.get(student.id))
                        }))
                    };
                    await withButtonLoading(confirmBtn, 'Переводим студентов и удаляем...', async () => {
                        await api(`/api/directions/${directionDeleteState.sourceDirection.id}/delete-with-transfer`, {
                            method: 'POST',
                            body: JSON.stringify(payload)
                        });
                    });
                    directionDeleteModalInstance.hide();
                    toast('Направление удалено, студенты переведены');
                    await loadDirections();
                } catch (error) {
                    toast(error?.message || 'Не удалось удалить направление.', 'danger');
                }
            });

            directionDeleteModalEl.addEventListener('hidden.bs.modal', () => {
                directionDeleteState.sourceDirection = null;
                directionDeleteState.sourceGroups = [];
                directionDeleteState.sourceStudents = [];
                directionDeleteState.targetDirections = [];
                directionDeleteState.targetGroups = [];
                directionDeleteState.targetDirectionId = null;
                directionDeleteState.selectedSourceGroupId = null;
                directionDeleteState.assignments.clear();
            });
        };

        const renderDirectionDeleteStudentsTable = () => {
            if (!directionDeleteModalEl) return;
            const sourceGroupEl = document.getElementById('directionDeleteSourceGroup');
            const studentsBody = document.getElementById('directionDeleteStudentsBody');
            const summaryEl = document.getElementById('directionDeleteTransferSummary');
            const confirmBtn = document.getElementById('directionDeleteConfirmBtn');
            const targetDirectionEl = document.getElementById('directionDeleteTargetDirection');

            const studentsForSelectedGroup = directionDeleteState.selectedSourceGroupId
                ? directionDeleteState.sourceStudents.filter(student => Number(student.groupId) === Number(directionDeleteState.selectedSourceGroupId))
                : [...directionDeleteState.sourceStudents];

            const assignedCount = directionDeleteState.sourceStudents.filter(student => {
                const assignedGroupId = directionDeleteState.assignments.get(student.id);
                return directionDeleteState.targetGroups.some(group => Number(group.id) === Number(assignedGroupId));
            }).length;

            const options = directionDeleteState.targetGroups.map(group => {
                const label = `${group.code} (${group.course || '—'} курс)`;
                return `<option value="${group.id}">${escapeHtml(label)}</option>`;
            }).join('');

            studentsBody.innerHTML = studentsForSelectedGroup.length === 0
                ? '<tr><td colspan="3" class="text-center text-muted py-3">Нет студентов в выбранной группе</td></tr>'
                : studentsForSelectedGroup.map((student) => {
                    const assignedGroupId = directionDeleteState.assignments.get(student.id);
                    const currentGroup = escapeHtml(safeValue(student.groupCode));
                    return `<tr data-student-id="${student.id}">
                        <td>${escapeHtml(student.fullName || '')}</td>
                        <td><span class="badge text-bg-light">${currentGroup}</span></td>
                        <td>
                            <select class="form-select form-select-sm direction-delete-target-group">
                                <option value="">Выберите группу</option>
                                ${options}
                            </select>
                        </td>
                    </tr>`;
                }).join('');

            studentsBody.querySelectorAll('.direction-delete-target-group').forEach((selectEl) => {
                const row = selectEl.closest('tr');
                const studentId = Number(row?.dataset.studentId);
                const assignedGroupId = directionDeleteState.assignments.get(studentId);
                if (assignedGroupId && Array.from(selectEl.options).some(option => Number(option.value) === Number(assignedGroupId))) {
                    selectEl.value = String(assignedGroupId);
                }
                selectEl.addEventListener('change', () => {
                    const selected = selectEl.value ? Number(selectEl.value) : null;
                    if (selected) {
                        directionDeleteState.assignments.set(studentId, selected);
                    } else {
                        directionDeleteState.assignments.delete(studentId);
                    }
                    renderDirectionDeleteStudentsTable();
                });
            });

            if (summaryEl) {
                summaryEl.textContent = `Назначено переводов: ${assignedCount} из ${directionDeleteState.sourceStudents.length}`;
            }
            if (confirmBtn) {
                // Keep action available and show detailed validation message on click.
                confirmBtn.disabled = false;
            }
            if (targetDirectionEl) {
                targetDirectionEl.disabled = directionDeleteState.targetDirections.length === 0;
            }
            if (sourceGroupEl) {
                sourceGroupEl.disabled = directionDeleteState.sourceGroups.length === 0;
            }
        };

        const openDirectionDeleteModal = async (direction) => {
            ensureDirectionDeleteModal();
            directionDeleteState.sourceDirection = direction;
            directionDeleteState.sourceGroups = await api(`/api/groups?directionId=${direction.id}`);
            directionDeleteState.sourceStudents = await api(`/api/students?directionId=${direction.id}`);
            directionDeleteState.targetDirections = (await api(`/api/directions?facultyId=${direction.facultyId}`))
                .filter(item => Number(item.id) !== Number(direction.id));
            directionDeleteState.assignments.clear();

            if (directionDeleteState.sourceStudents.length === 0) {
                if (await confirmAction({
                    title: 'Удаление направления',
                    message: 'Удалить направление? Группы и учебные планы направления будут удалены каскадно.',
                    confirmText: 'Удалить'
                })) {
                    await api(`/api/directions/${direction.id}`, {method: 'DELETE'});
                    toast('Направление удалено');
                    await loadDirections();
                }
                return;
            }

            if (directionDeleteState.targetDirections.length === 0) {
                toast('Для этого факультета нет другого направления, куда можно перевести студентов.', 'danger');
                return;
            }

            const targetDirectionEl = document.getElementById('directionDeleteTargetDirection');
            const sourceGroupEl = document.getElementById('directionDeleteSourceGroup');
            targetDirectionEl.innerHTML = `<option value="">Выберите направление</option>${directionDeleteState.targetDirections
                .map(item => `<option value="${item.id}">${escapeHtml(item.code)} ${escapeHtml(item.name)}</option>`)
                .join('')}`;
            sourceGroupEl.innerHTML = directionDeleteState.sourceGroups.length === 0
                ? '<option value="">Нет групп</option>'
                : directionDeleteState.sourceGroups.map(group => `<option value="${group.id}">${escapeHtml(group.code)}</option>`).join('');

            directionDeleteState.selectedSourceGroupId = directionDeleteState.sourceGroups.length > 0
                ? Number(directionDeleteState.sourceGroups[0].id)
                : null;
            sourceGroupEl.value = directionDeleteState.selectedSourceGroupId ? String(directionDeleteState.selectedSourceGroupId) : '';

            directionDeleteState.targetDirectionId = Number(directionDeleteState.targetDirections[0].id);
            targetDirectionEl.value = String(directionDeleteState.targetDirectionId);
            directionDeleteState.targetGroups = await api(`/api/groups?directionId=${directionDeleteState.targetDirectionId}`);

            if (directionDeleteState.targetGroups.length > 0) {
                directionDeleteState.sourceStudents.forEach((student) => {
                    const sourceGroup = getDirectionSourceGroupById(student.groupId);
                    const preferred = pickPreferredTransferGroup(sourceGroup, directionDeleteState.targetGroups);
                    if (preferred) {
                        directionDeleteState.assignments.set(student.id, preferred.id);
                    }
                });
            }

            renderDirectionDeleteStudentsTable();
            directionDeleteModalInstance.show();
        };

        const bindDirectionActions = () => {
            directionsTable.querySelectorAll('[data-action="edit-direction"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const direction = directions.find(d => d.id == id)
                        || (await api('/api/directions')).find(d => d.id == id);
                    if (!direction) return;
                    document.getElementById('directionModalTitle').textContent = 'Редактирование направления';
                    document.getElementById('directionId').value = direction.id;
                    document.getElementById('directionCode').value = direction.code;
                    document.getElementById('directionName').value = direction.name;
                    if (directionShortNameInput) {
                        directionShortNameInput.value = normalizeDirectionShortName(direction.shortName);
                        setDirectionShortNameManualFlag(directionNameInput, directionShortNameInput);
                    }
                    document.getElementById('directionFaculty').value = direction.facultyId;
                    document.getElementById('directionAnnualTuition').value = formatAnnualTuition(direction.annualTuition);
                    clearDirectionValidationError();
                    new bootstrap.Modal(document.getElementById('directionModal')).show();
                });
            });
            directionsTable.querySelectorAll('[data-action="delete-direction"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const direction = directions.find(item => String(item.id) === String(id))
                        || sourceDirections.find(item => String(item.id) === String(id));
                    if (!direction) return;
                    openDirectionDeleteModal(direction).catch(err => toast(err.message, 'danger'));
                });
            });
        };

        document.getElementById('saveFacultyBtn').addEventListener('click', async () => {
            clearFacultyValidationError();
            const normalizedName = stripFacultyPrefix(facultyNameInput.value);
            const localValidationMessage = syncFacultyValidationState(true);
            if (localValidationMessage) {
                showFacultyValidationError(localValidationMessage);
                toast(localValidationMessage, 'danger');
                return;
            }
            if (!facultyForm.checkValidity()) {
                facultyForm.classList.add('was-validated');
                const reason = getFacultyValidationReason(facultyNameInput);
                showFacultyValidationError(reason);
                toast(reason, 'danger');
                return;
            }
            const payload = {
                name: normalizedName,
                shortName: String(facultyShortNameInput?.value || '').trim()
            };
            const id = document.getElementById('facultyId').value;
            const url = id ? `/api/faculties/${id}` : '/api/faculties';
            const method = id ? 'PUT' : 'POST';
            try {
                await api(url, {method, body: JSON.stringify(payload)});
                bootstrap.Modal.getInstance(document.getElementById('facultyModal')).hide();
                toast('Сохранено');
                facultyForm.reset();
                facultyForm.classList.remove('was-validated');
                document.getElementById('facultyId').value = '';
                await loadFaculties();
                await loadDirections();
            } catch (error) {
                const validationPayload = (error && error.payload && typeof error.payload === 'object') ? error.payload : null;
                const validationMessage = validationPayload?.name
                    || validationPayload?.shortName
                    || error?.message
                    || 'Не удалось сохранить данные.';
                if (validationPayload?.name) {
                    showFacultyValidationError(validationPayload.name);
                }
                toast(validationMessage, 'danger');
            }
        });

        document.getElementById('saveDirectionBtn').addEventListener('click', async () => {
            clearDirectionValidationError();
            clearDirectionAnnualTuitionValidationError();
            const form = document.getElementById('directionForm');
            applyDirectionCodeMask();
            applyAnnualTuitionMask();
            const normalizedDirectionName = normalizeDirectionName(directionNameInput.value);
            const localValidationMessage = syncDirectionValidationState(true);
            if (localValidationMessage) {
                showDirectionValidationError(localValidationMessage);
                toast(localValidationMessage, 'danger');
                return;
            }
            const localAnnualTuitionValidationMessage = syncDirectionAnnualTuitionValidationState(true);
            if (localAnnualTuitionValidationMessage) {
                showDirectionAnnualTuitionValidationError(localAnnualTuitionValidationMessage);
                toast(localAnnualTuitionValidationMessage, 'danger');
                return;
            }
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                const invalidField = form.querySelector(':invalid');
                if (invalidField === directionNameInput) {
                    const reason = getDirectionValidationReason(directionNameInput);
                    showDirectionValidationError(reason);
                    toast(reason, 'danger');
                    return;
                }
                if (invalidField === directionAnnualTuitionEl) {
                    const reason = getDirectionAnnualTuitionValidationReason(directionAnnualTuitionEl);
                    showDirectionAnnualTuitionValidationError(reason);
                    toast(reason, 'danger');
                    return;
                }
                const reason = invalidField?.validationMessage || 'Проверьте корректность заполнения формы.';
                toast(reason, 'danger');
                if (invalidField && typeof invalidField.reportValidity === 'function') {
                    invalidField.reportValidity();
                }
                return;
            }
            const payload = {
                code: document.getElementById('directionCode').value.trim(),
                name: normalizedDirectionName,
                shortName: String(directionShortNameInput?.value || '').trim(),
                facultyId: Number(document.getElementById('directionFaculty').value),
                annualTuition: normalizeAnnualTuition(document.getElementById('directionAnnualTuition').value)
            };
            const id = document.getElementById('directionId').value;
            const url = id ? `/api/directions/${id}` : '/api/directions';
            const method = id ? 'PUT' : 'POST';
            try {
                await api(url, {method, body: JSON.stringify(payload)});
                bootstrap.Modal.getInstance(document.getElementById('directionModal')).hide();
                toast('Сохранено');
                form.reset();
                form.classList.remove('was-validated');
                clearDirectionValidationError();
                document.getElementById('directionId').value = '';
                await loadDirections();
            } catch (error) {
                const validationPayload = (error && error.payload && typeof error.payload === 'object') ? error.payload : null;
                const validationMessage = validationPayload?.name
                    || validationPayload?.annualTuition
                    || validationPayload?.shortName
                    || error?.message
                    || 'Не удалось сохранить данные.';
                if (validationPayload?.name) {
                    showDirectionValidationError(validationPayload.name);
                }
                if (validationPayload?.annualTuition) {
                    showDirectionAnnualTuitionValidationError(validationPayload.annualTuition);
                }
                toast(validationMessage, 'danger');
            }
        });

        document.getElementById('directionModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('directionForm').reset();
            document.getElementById('directionForm').classList.remove('was-validated');
            clearDirectionValidationError();
            clearDirectionAnnualTuitionValidationError();
            document.getElementById('directionId').value = '';
            document.getElementById('directionModalTitle').textContent = 'Новое направление';
            if (directionShortNameInput) {
                directionShortNameInput.dataset.shortNameManual = 'false';
            }
        });
        directionModalEl.addEventListener('show.bs.modal', () => {
            if (directionIdEl.value) {
                return;
            }
            applyDirectionShortNameAuto(directionNameInput, directionShortNameInput, true);
            const selectedFacultyId = facultyFilter.value;
            if (!selectedFacultyId) {
                return;
            }
            const hasFacultyOption = Array.from(directionFacultySelectEl.options)
                .some(option => option.value === String(selectedFacultyId));
            if (hasFacultyOption) {
                directionFacultySelectEl.value = String(selectedFacultyId);
            }
        });
        if (directionCodeEl) {
            directionCodeEl.addEventListener('beforeinput', (event) => {
                if (!event.data || !event.inputType || !event.inputType.startsWith('insert')) {
                    return;
                }
                if (/\D/.test(event.data)) {
                    event.preventDefault();
                }
            });
            directionCodeEl.addEventListener('input', applyDirectionCodeMask);
            directionCodeEl.addEventListener('paste', (event) => {
                event.preventDefault();
                const pasted = event.clipboardData?.getData('text') || '';
                directionCodeEl.value = formatDirectionCode(pasted);
            });
        }
        if (directionAnnualTuitionEl) {
            directionAnnualTuitionEl.addEventListener('beforeinput', (event) => {
                if (!event.data || !event.inputType || !event.inputType.startsWith('insert')) {
                    return;
                }
                if (!/[0-9.,]/.test(event.data)) {
                    event.preventDefault();
                }
            });
            directionAnnualTuitionEl.addEventListener('input', () => {
                applyAnnualTuitionMask(true);
                syncDirectionAnnualTuitionValidationState(false);
            });
            directionAnnualTuitionEl.addEventListener('paste', (event) => {
                event.preventDefault();
                const pasted = event.clipboardData?.getData('text') || '';
                directionAnnualTuitionEl.value = pasted;
                applyAnnualTuitionMask(true);
                syncDirectionAnnualTuitionValidationState(false);
            });
            directionAnnualTuitionEl.addEventListener('blur', () => {
                applyAnnualTuitionMask();
                syncDirectionAnnualTuitionValidationState(true);
            });
        }
        if (directionNameInput && directionShortNameInput) {
            directionNameInput.addEventListener('input', () => {
                applyDirectionShortNameAuto(directionNameInput, directionShortNameInput);
                syncDirectionValidationState(false);
            });
            directionShortNameInput.addEventListener('input', () => {
                setDirectionShortNameManualFlag(directionNameInput, directionShortNameInput);
            });
        }
        document.getElementById('facultyModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('facultyForm').reset();
            document.getElementById('facultyForm').classList.remove('was-validated');
            clearFacultyValidationError();
            document.getElementById('facultyId').value = '';
            document.getElementById('facultyModalTitle').textContent = 'Новый факультет';
            if (facultyShortNameInput) {
                facultyShortNameInput.dataset.shortNameManual = 'false';
            }
        });
        document.getElementById('facultyModal').addEventListener('show.bs.modal', () => {
            if (document.getElementById('facultyId').value) {
                return;
            }
            applyFacultyShortNameAuto(facultyNameInput, facultyShortNameInput, true);
        });
        if (facultyNameInput && facultyShortNameInput) {
            facultyNameInput.addEventListener('input', () => {
                applyFacultyShortNameAuto(facultyNameInput, facultyShortNameInput);
                syncFacultyValidationState(false);
            });
            facultyShortNameInput.addEventListener('input', () => {
                setFacultyShortNameManualFlag(facultyNameInput, facultyShortNameInput);
            });
        }

        directionsPageSizeSelect.addEventListener('change', () => {
            directionsCurrentPage = 0;
            renderDirectionsPage();
        });
        directionsPageFirst.addEventListener('click', () => {
            if (directionsCurrentPage > 0) {
                directionsCurrentPage = 0;
                renderDirectionsPage();
            }
        });
        directionsPagePrev.addEventListener('click', () => {
            if (directionsCurrentPage > 0) {
                directionsCurrentPage -= 1;
                renderDirectionsPage();
            }
        });
        directionsPageNumbers.addEventListener('click', (event) => {
            const button = event.target.closest('[data-page-index]');
            if (!button) return;
            const targetPage = Number(button.dataset.pageIndex);
            if (!Number.isNaN(targetPage) && targetPage !== directionsCurrentPage) {
                directionsCurrentPage = targetPage;
                renderDirectionsPage();
            }
        });
        directionsPageNext.addEventListener('click', () => {
            if (directionsCurrentPage < directionsLastTotalPages - 1) {
                directionsCurrentPage += 1;
                renderDirectionsPage();
            }
        });
        directionsPageLast.addEventListener('click', () => {
            if (directionsLastTotalPages > 0 && directionsCurrentPage < directionsLastTotalPages - 1) {
                directionsCurrentPage = directionsLastTotalPages - 1;
                renderDirectionsPage();
            }
        });

        facultyFilter.addEventListener('change', () => {
            directionsCurrentPage = 0;
            loadDirections();
        });
        if (searchEl) {
            searchEl.addEventListener('input', () => applyDirectionsFiltersAndSort({resetPage: true}));
            searchEl.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyDirectionsFiltersAndSort({resetPage: true});
                }
            });
        }
        sortEl.addEventListener('change', () => {
            applyDirectionsFiltersAndSort({resetPage: true});
        });
        sortDirectionEl.addEventListener('change', () => {
            applyDirectionsFiltersAndSort({resetPage: true});
        });
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                if (searchEl) {
                    searchEl.value = '';
                }
                facultyFilter.value = '';
                sortEl.value = 'createdAt';
                sortDirectionEl.value = 'desc';
                directionsCurrentPage = 0;
                loadDirections().catch(err => toast(err.message, 'danger'));
            });
        }
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                directionsCurrentPage = 0;
                loadDirections().catch(err => toast(err.message, 'danger'));
            });
        }

        (async () => {
            await loadFaculties();
            await loadDirections();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Учебные планы (READ ONLY) =====
    function initCurriculumsPage() {
        const page = document.getElementById('curriculumsPage');
        if (!page) return;

        const facultySelect = document.getElementById('curriculumFaculty');
        const directionSelect = document.getElementById('curriculumDirection');
        const educationLevelSelect = document.getElementById('curriculumEducationLevel');
        const educationFormSelect = document.getElementById('curriculumEducationForm');
        const acceleratedCheckbox = document.getElementById('curriculumAccelerated');
        const reloadBtn = document.getElementById('reloadCurriculums');
        const showBtn = document.getElementById('showCurriculumPlan');
        const resetFiltersBtn = document.getElementById('resetCurriculumFilters');
        const emptyStateEl = document.getElementById('curriculumEmptyState');
        const resultCardEl = document.getElementById('curriculumResultCard');
        const selectionMetaEl = document.getElementById('curriculumSelectionMeta');
        const courseTabsEl = document.getElementById('curriculumCourseTabs');
        const semesterTabsEl = document.getElementById('curriculumSemesterTabs');
        const table = document.getElementById('curriculumTable');
        const countEl = document.getElementById('curriculumCount');
        const planYearSelect = document.getElementById('curriculumPlanYear');

        const comparePanelEl = document.getElementById('curriculumComparePanel');
        const comparePanelMetaEl = document.getElementById('curriculumCompareMeta');
        const compareLeftDirectionEl = document.getElementById('curriculumCompareLeftDirection');
        const compareLeftEducationLevelEl = document.getElementById('curriculumCompareLeftEducationLevel');
        const compareLeftEducationFormEl = document.getElementById('curriculumCompareLeftEducationForm');
        const compareLeftPlanYearEl = document.getElementById('curriculumCompareLeftPlanYear');
        const compareLeftAcceleratedEl = document.getElementById('curriculumCompareLeftAccelerated');
        const compareRightDirectionEl = document.getElementById('curriculumCompareRightDirection');
        const compareRightEducationLevelEl = document.getElementById('curriculumCompareRightEducationLevel');
        const compareRightEducationFormEl = document.getElementById('curriculumCompareRightEducationForm');
        const compareRightPlanYearEl = document.getElementById('curriculumCompareRightPlanYear');
        const compareRightAcceleratedEl = document.getElementById('curriculumCompareRightAccelerated');
        const compareToggleDiffBtn = document.getElementById('curriculumCompareToggleDiff');
        const compareResetBtn = document.getElementById('curriculumCompareReset');
        const compareCourseTabsEl = document.getElementById('curriculumCompareCourseTabs');
        const compareSemesterTabsEl = document.getElementById('curriculumCompareSemesterTabs');
        const compareLeftLabelEl = document.getElementById('curriculumCompareLeftLabel');
        const compareRightLabelEl = document.getElementById('curriculumCompareRightLabel');
        const compareLeftTableEl = document.getElementById('curriculumCompareLeftTable');
        const compareRightTableEl = document.getElementById('curriculumCompareRightTable');

        let sourceCurriculums = [];
        let requestedCurriculums = [];
        let appliedCurriculums = [];
        let selectedCourse = null;
        let selectedSemester = 'all';
        let selectedPlanYear = null;

        const compareState = {
            leftRows: [],
            rightRows: [],
            selectedCourse: null,
            selectedSemester: 'all',
            showOnlyDifference: false,
            sameDirectionMode: false
        };

        const educationLevelOrder = ['BACHELOR', 'SPECIALIST', 'MASTER'];
        const educationFormOrder = ['FULL_TIME', 'PART_TIME', 'DISTANCE'];

        const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), 'ru-RU', {
            numeric: true,
            sensitivity: 'base'
        });

        const normalizeDiscipline = (value) => String(value || '')
            .replace(/\s*\(\d{2}\.\d{2}\.\d{2}\)\s*$/u, '')
            .trim();

        const planYearLabel = (year) => {
            const startYear = Number(year) || 0;
            if (!startYear) return '—';
            return `${startYear}/${startYear + 1} год`;
        };

        const renderDataSelect = (selectEl, list, placeholder) => {
            if (!selectEl) return;
            const previousValue = selectEl.value;
            const options = [`<option value="">${placeholder}</option>`]
                .concat(list.map(item => `<option value="${item.id}">${item.displayName || item.name || item.code}</option>`));
            selectEl.innerHTML = options.join('');
            if (previousValue && Array.from(selectEl.options).some(option => option.value === String(previousValue))) {
                selectEl.value = String(previousValue);
            }
        };

        const renderPlainSelect = (selectEl, values, formatter, placeholder = 'Все') => {
            if (!selectEl) return;
            const previousValue = String(selectEl.value || '');
            const options = [`<option value="">${placeholder}</option>`]
                .concat(values.map(value => `<option value="${value}">${formatter(value)}</option>`));
            selectEl.innerHTML = options.join('');
            if (previousValue && values.includes(previousValue)) {
                selectEl.value = previousValue;
            } else {
                selectEl.value = '';
            }
        };

        const formatEducationLevelLabel = (value) => {
            if (value === 'BACHELOR') return 'Бакалавр';
            if (value === 'SPECIALIST') return 'Специалитет';
            if (value === 'MASTER') return 'Магистратура';
            return value;
        };

        const formatEducationFormLabel = (value) => {
            if (value === 'FULL_TIME') return 'Очная';
            if (value === 'PART_TIME') return 'Очно-заочная';
            if (value === 'DISTANCE') return 'Заочная';
            return value;
        };

        const curriculumAttestationLabel = (item) => {
            const base = safeValue(item?.attestation);
            if (!Boolean(item?.courseWork)) {
                return base;
            }
            return base ? `${base}, курсовая работа` : 'курсовая работа';
        };

        const uniqueSorted = (values, order) => {
            return Array.from(new Set(values.filter(Boolean))).sort((left, right) => {
                const leftIndex = order.indexOf(left);
                const rightIndex = order.indexOf(right);
                if (leftIndex !== -1 || rightIndex !== -1) {
                    if (leftIndex === -1) return 1;
                    if (rightIndex === -1) return -1;
                    return leftIndex - rightIndex;
                }
                return compareText(left, right);
            });
        };

        const dedupeCurriculums = (list, includePlanYear = true) => {
            const map = new Map();
            (list || []).forEach(item => {
                const key = [
                    Number(item.course) || 0,
                    Number(item.semester) || 0,
                    normalizeDiscipline(item.discipline),
                    Number(item.hours) || 0,
                    String(item.attestation || ''),
                    Boolean(item.courseWork) ? '1' : '0',
                    includePlanYear ? (Number(item.planYear) || 0) : 0
                ].join('|');
                if (!map.has(key)) {
                    map.set(key, item);
                }
            });
            return Array.from(map.values());
        };

        const hideResult = () => {
            resultCardEl.classList.add('d-none');
            emptyStateEl.classList.remove('d-none');
            countEl.textContent = '0';
            selectionMetaEl.textContent = '';
            courseTabsEl.innerHTML = '';
            semesterTabsEl.innerHTML = '';
            table.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Нет данных</td></tr>';
            requestedCurriculums = [];
            appliedCurriculums = [];
            selectedCourse = null;
            selectedSemester = 'all';
            selectedPlanYear = null;
            if (planYearSelect) {
                planYearSelect.innerHTML = '<option value="">Год плана</option>';
                planYearSelect.disabled = true;
            }
            resetCompareView();
        };

        const resetCompareView = () => {
            compareState.leftRows = [];
            compareState.rightRows = [];
            compareState.selectedCourse = null;
            compareState.selectedSemester = 'all';
            compareState.showOnlyDifference = false;
            compareState.sameDirectionMode = false;
            if (compareCourseTabsEl) compareCourseTabsEl.innerHTML = '';
            if (compareSemesterTabsEl) compareSemesterTabsEl.innerHTML = '';
            if (compareLeftTableEl) compareLeftTableEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
            if (compareRightTableEl) compareRightTableEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
        };

        const loadFaculties = async () => {
            const faculties = mapFacultyForDisplay(await api('/api/faculties'));
            renderDataSelect(facultySelect, faculties, 'Все');
        };

        const loadDirections = async (facultyId) => {
            const url = facultyId ? `/api/directions?facultyId=${facultyId}` : '/api/directions';
            renderDataSelect(directionSelect, await api(url), 'Все');
        };

        const loadCurriculums = async () => {
            sourceCurriculums = (await api('/api/curriculums')).map(item => ({
                ...item,
                course: Number(item.course) || 0,
                semester: Number(item.semester) || 0,
                hours: Number(item.hours) || 0,
                planYear: Number(item.planYear) || 0,
                educationLevel: String(item.educationLevel || 'BACHELOR'),
                educationForm: String(item.educationForm || 'FULL_TIME'),
                accelerated: Boolean(item.accelerated),
                discipline: normalizeDiscipline(item.discipline)
            }));
        };

        const getCurriculumScope = () => {
            let scope = sourceCurriculums;
            if (directionSelect.value) {
                scope = scope.filter(item => Number(item.directionId) === Number(directionSelect.value));
            }
            if (facultySelect.value) {
                const byFaculty = scope.filter(item => Number(item.facultyId) === Number(facultySelect.value));
                if (byFaculty.length > 0) {
                    scope = byFaculty;
                }
            }
            return scope;
        };

        const updateDependentFilters = () => {
            const scope = getCurriculumScope();
            const availableLevels = uniqueSorted(scope.map(item => String(item.educationLevel || '')), educationLevelOrder);
            renderPlainSelect(educationLevelSelect, availableLevels, formatEducationLevelLabel, 'Все');
            if (directionSelect.value && !educationLevelSelect.value && availableLevels.length > 0) {
                educationLevelSelect.value = availableLevels[0];
            }

            const scopedByLevel = educationLevelSelect.value
                ? scope.filter(item => String(item.educationLevel || '') === String(educationLevelSelect.value))
                : scope;
            const availableForms = uniqueSorted(scopedByLevel.map(item => String(item.educationForm || '')), educationFormOrder);
            renderPlainSelect(educationFormSelect, availableForms, formatEducationFormLabel, 'Все');
            if (directionSelect.value && !educationFormSelect.value && availableForms.length > 0) {
                educationFormSelect.value = availableForms[0];
            }

            const acceleratedAvailable = scopedByLevel
                .filter(item => !educationFormSelect.value || String(item.educationForm || '') === String(educationFormSelect.value))
                .some(item => Boolean(item.accelerated));
            acceleratedCheckbox.disabled = !acceleratedAvailable;
            if (!acceleratedAvailable) {
                acceleratedCheckbox.checked = false;
            }
        };

        const requiredFiltersMissing = () => {
            const missing = [];
            if (!facultySelect.value) missing.push('факультет');
            if (!directionSelect.value) missing.push('направление');
            if (!educationLevelSelect.value) missing.push('уровень образования');
            if (!educationFormSelect.value) missing.push('форму обучения');
            return missing;
        };

        const getRequestedCurriculums = () => {
            const facultyId = Number(facultySelect.value);
            const directionId = Number(directionSelect.value);
            const educationLevel = String(educationLevelSelect.value);
            const educationForm = String(educationFormSelect.value);
            const acceleratedOnly = Boolean(acceleratedCheckbox.checked);

            let rows = sourceCurriculums
                .filter(item => Number(item.directionId) === directionId)
                .filter(item => String(item.educationLevel || '') === educationLevel)
                .filter(item => String(item.educationForm || '') === educationForm)
                .filter(item => !acceleratedOnly || Boolean(item.accelerated));

            const byFaculty = rows.filter(item => Number(item.facultyId) === facultyId);
            if (byFaculty.length > 0) {
                rows = byFaculty;
            }
            return rows;
        };

        const getRowsForSelectedYear = () => {
            if (!selectedPlanYear || selectedPlanYear === 'all') {
                return dedupeCurriculums(requestedCurriculums, false);
            }
            return dedupeCurriculums(
                requestedCurriculums.filter(item => Number(item.planYear) === Number(selectedPlanYear)),
                false
            );
        };

        const syncPlanYearSelect = () => {
            if (!planYearSelect) return;
            const years = Array.from(
                new Set(requestedCurriculums.map(item => Number(item.planYear)).filter(year => Number.isFinite(year) && year > 0))
            ).sort((left, right) => right - left);
            if (years.length === 0) {
                selectedPlanYear = 'all';
                planYearSelect.innerHTML = '<option value="all">Актуальная редакция</option>';
                planYearSelect.disabled = false;
                planYearSelect.value = 'all';
                return;
            }
            if (!years.includes(Number(selectedPlanYear))) {
                selectedPlanYear = years[0];
            }
            planYearSelect.innerHTML = years.map(year => `<option value="${year}">${planYearLabel(year)}</option>`).join('');
            planYearSelect.disabled = false;
            planYearSelect.value = String(selectedPlanYear);
        };

        const buildCourseTabs = () => {
            const courses = Array.from(
                new Set(appliedCurriculums.map(item => Number(item.course)).filter(value => Number.isFinite(value) && value > 0))
            ).sort((left, right) => left - right);

            if (courses.length === 0) {
                selectedCourse = null;
                courseTabsEl.innerHTML = '<div class="text-muted small">Нет курсов</div>';
                semesterTabsEl.innerHTML = '';
                return;
            }

            if (!courses.includes(Number(selectedCourse))) {
                selectedCourse = courses[0];
            }

            courseTabsEl.innerHTML = courses.map(course => {
                const activeClass = Number(selectedCourse) === course ? 'active' : '';
                return `<button type="button" class="nav-link ${activeClass}" data-course="${course}">
                    ${course} курс
                </button>`;
            }).join('');
        };

        const buildSemesterTabs = () => {
            if (!selectedCourse) {
                semesterTabsEl.innerHTML = '';
                selectedSemester = 'all';
                return;
            }

            const firstSemester = Number(selectedCourse) * 2 - 1;
            const secondSemester = Number(selectedCourse) * 2;
            const tabs = [
                {id: 'all', label: 'Все'},
                {id: String(firstSemester), label: `${firstSemester} семестр`},
                {id: String(secondSemester), label: `${secondSemester} семестр`}
            ];
            if (!tabs.some(tab => tab.id === selectedSemester)) {
                selectedSemester = 'all';
            }

            semesterTabsEl.innerHTML = tabs.map(tab => {
                const activeClass = selectedSemester === tab.id ? 'active' : '';
                return `<button type="button" class="nav-link ${activeClass}" data-semester="${tab.id}">
                    ${tab.label}
                </button>`;
            }).join('');
        };

        const renderPlanTable = () => {
            if (!selectedCourse) {
                countEl.textContent = '0';
                table.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Нет данных</td></tr>';
                return;
            }

            const rows = appliedCurriculums
                .filter(item => Number(item.course) === Number(selectedCourse))
                .filter(item => selectedSemester === 'all' || String(item.semester) === selectedSemester)
                .sort((left, right) => {
                    const semesterCmp = (Number(left.semester) || 0) - (Number(right.semester) || 0);
                    if (semesterCmp !== 0) return semesterCmp;
                    return compareText(left.discipline, right.discipline);
                });

            countEl.textContent = String(rows.length);
            table.innerHTML = rows.length === 0
                ? '<tr><td colspan="4" class="text-center text-muted py-4">Нет данных для выбранного семестра</td></tr>'
                : rows.map(item => `<tr>
                    <td class="col-semester">${safeValue(item.semester)}</td>
                    <td class="col-discipline fw-semibold">${safeValue(item.discipline)}</td>
                    <td class="col-hours">${safeValue(item.hours)}</td>
                    <td class="col-attestation">${escapeHtml(curriculumAttestationLabel(item))}</td>
                </tr>`).join('');
        };

        const renderAppliedPlan = () => {
            const directionText = directionSelect.options[directionSelect.selectedIndex]?.text || '';
            const levelText = formatEducationLevelLabel(educationLevelSelect.value);
            const formText = formatEducationFormLabel(educationFormSelect.value);
            const accelerationText = acceleratedCheckbox.checked ? ', ускоренная форма' : '';
            const yearText = selectedPlanYear
                ? ` • ${selectedPlanYear === 'all' ? 'актуальная редакция' : planYearLabel(selectedPlanYear)}`
                : '';

            selectionMetaEl.textContent = `${directionText} • ${levelText} • ${formText}${accelerationText}${yearText}`;
            emptyStateEl.classList.add('d-none');
            resultCardEl.classList.remove('d-none');
            buildCourseTabs();
            buildSemesterTabs();
            renderPlanTable();
        };

        const showPlan = (options = {}) => {
            const silent = Boolean(options.silent);
            const missing = requiredFiltersMissing();
            if (missing.length > 0) {
                if (!silent) {
                    toast(`Заполните обязательные поля: ${missing.join(', ')}.`, 'warning');
                }
                hideResult();
                return false;
            }

            requestedCurriculums = dedupeCurriculums(getRequestedCurriculums(), true);
            if (requestedCurriculums.length === 0 && directionSelect.value) {
                const directionRows = sourceCurriculums.filter(item => Number(item.directionId) === Number(directionSelect.value));
                if (directionRows.length > 0) {
                    const directionLevels = uniqueSorted(
                        directionRows.map(item => String(item.educationLevel || '')),
                        educationLevelOrder
                    );
                    if (directionLevels.length > 0 && !directionLevels.includes(String(educationLevelSelect.value || ''))) {
                        educationLevelSelect.value = directionLevels[0];
                    }

                    const directionForms = uniqueSorted(
                        directionRows
                            .filter(item => String(item.educationLevel || '') === String(educationLevelSelect.value || ''))
                            .map(item => String(item.educationForm || '')),
                        educationFormOrder
                    );
                    if (directionForms.length > 0 && !directionForms.includes(String(educationFormSelect.value || ''))) {
                        educationFormSelect.value = directionForms[0];
                    }
                    requestedCurriculums = dedupeCurriculums(getRequestedCurriculums(), true);
                }
            }
            if (requestedCurriculums.length === 0) {
                if (!silent) {
                    toast('Для выбранного набора фильтров учебные планы не найдены.', 'warning');
                }
                hideResult();
                return false;
            }
            syncPlanYearSelect();
            appliedCurriculums = getRowsForSelectedYear();
            selectedCourse = null;
            selectedSemester = 'all';
            renderAppliedPlan();
            return true;
        };

        const applyTopPlanFiltersInstantly = () => {
            refreshComparePanel({syncFromTopFilters: true});
            showPlan({silent: true});
        };

        const invalidatePlan = () => {
            hideResult();
            refreshComparePanel({syncFromTopFilters: true});
        };

        const getCompareBaseScope = () => {
            const facultyId = Number(facultySelect.value || 0);
            const educationLevel = String(educationLevelSelect.value || '');
            if (!facultyId) {
                return [];
            }
            return sourceCurriculums
                .filter(item => Number(item.facultyId) === facultyId)
                .filter(item => !educationLevel || String(item.educationLevel || '') === educationLevel);
        };

        const readCompareVariant = (side) => {
            const isLeft = side === 'left';
            const levelEl = isLeft ? compareLeftEducationLevelEl : compareRightEducationLevelEl;
            const formEl = isLeft ? compareLeftEducationFormEl : compareRightEducationFormEl;
            const acceleratedEl = isLeft ? compareLeftAcceleratedEl : compareRightAcceleratedEl;
            return {
                educationLevel: String(levelEl?.value || ''),
                educationForm: String(formEl?.value || ''),
                acceleratedOnly: Boolean(acceleratedEl?.checked)
            };
        };

        const buildCompareVariantLabel = (variant) => {
            const levelText = variant.educationLevel
                ? formatEducationLevelLabel(variant.educationLevel)
                : 'все уровни';
            const formText = variant.educationForm
                ? formatEducationFormLabel(variant.educationForm)
                : 'все формы';
            const coreText = `${levelText}, ${formText}`;
            return variant.acceleratedOnly
                ? `${coreText}, только ускоренные`
                : coreText;
        };

        const getCompareScopeByVariant = (variant = {}) => {
            let rows = getCompareBaseScope();
            if (variant.educationLevel) {
                rows = rows.filter(item => String(item.educationLevel || '') === String(variant.educationLevel));
            }
            if (variant.directionId) {
                rows = rows.filter(item => Number(item.directionId) === Number(variant.directionId));
            }
            if (variant.educationForm) {
                rows = rows.filter(item => String(item.educationForm || '') === String(variant.educationForm));
            }
            if (variant.acceleratedOnly) {
                rows = rows.filter(item => Boolean(item.accelerated));
            }
            return rows;
        };

        const getCompareDirectionOptions = (variant = {}) => {
            const map = new Map();
            getCompareScopeByVariant({...variant, directionId: null}).forEach(item => {
                const id = Number(item.directionId);
                if (!id || map.has(id)) return;
                map.set(id, {
                    id,
                    name: item.directionName || `Направление #${id}`
                });
            });
            return Array.from(map.values()).sort((left, right) => compareText(left.name, right.name));
        };

        const getYearsForCompareVariant = (directionId, variant = {}) => Array.from(
            new Set(
                getCompareScopeByVariant({...variant, directionId})
                    .map(item => Number(item.planYear))
                    .filter(year => Number.isFinite(year) && year > 0)
            )
        ).sort((left, right) => right - left);

        const buildYearRangeDesc = (startYear, endYear) => {
            if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear < startYear) {
                return [];
            }
            const years = [];
            for (let year = endYear; year >= startYear; year -= 1) {
                years.push(year);
            }
            return years;
        };

        const getEffectivePlanYearForVariant = (directionId, requestedYear, variant = {}) => {
            const yearsDesc = getYearsForCompareVariant(directionId, variant);
            if (!yearsDesc.length) return null;
            const yearsAsc = [...yearsDesc].sort((left, right) => left - right);
            const requested = Number(requestedYear);
            if (!Number.isFinite(requested) || requested <= 0) {
                return yearsDesc[0];
            }
            let effective = yearsAsc[0];
            for (const year of yearsAsc) {
                if (year <= requested) {
                    effective = year;
                } else {
                    break;
                }
            }
            return effective;
        };

        const getSharedYearsForVariants = (leftDirectionId, leftVariant, rightDirectionId, rightVariant) => {
            const leftYears = getYearsForCompareVariant(leftDirectionId, leftVariant);
            const rightYears = getYearsForCompareVariant(rightDirectionId, rightVariant);
            if (!leftYears.length || !rightYears.length) {
                return [];
            }
            const leftMin = Math.min(...leftYears);
            const leftMax = Math.max(...leftYears);
            const rightMin = Math.min(...rightYears);
            const rightMax = Math.max(...rightYears);
            const startYear = Math.max(leftMin, rightMin);
            const endYear = Math.max(leftMax, rightMax);
            return buildYearRangeDesc(startYear, endYear);
        };

        const formatComparePlanYearLabel = (directionId, requestedYear, variant = {}) => {
            const requested = Number(requestedYear);
            if (!Number.isFinite(requested) || requested <= 0) {
                return '—';
            }
            const effective = getEffectivePlanYearForVariant(directionId, requested, variant);
            if (!effective) {
                return planYearLabel(requested);
            }
            if (Number(effective) === requested) {
                return planYearLabel(requested);
            }
            return `${planYearLabel(requested)} (по плану ${planYearLabel(effective)})`;
        };

        const renderCompareDirectionSelect = (selectEl, options, preferredId) => {
            if (!selectEl) return;
            if (!options.length) {
                selectEl.innerHTML = '<option value="">Нет доступных направлений</option>';
                selectEl.value = '';
                selectEl.disabled = true;
                return;
            }
            selectEl.disabled = false;
            selectEl.innerHTML = options.map(option => `<option value="${option.id}">${escapeHtml(option.name)}</option>`).join('');
            if (preferredId && options.some(option => Number(option.id) === Number(preferredId))) {
                selectEl.value = String(preferredId);
            } else {
                selectEl.value = String(options[0].id);
            }
        };

        const renderCompareFormSelect = (selectEl, forms, preferredValue = '') => {
            if (!selectEl) return;
            const values = Array.from(new Set(forms.filter(Boolean)));
            const options = ['<option value="">Все формы</option>']
                .concat(values.map(form => `<option value="${form}">${formatEducationFormLabel(form)}</option>`));
            selectEl.innerHTML = options.join('');
            if (preferredValue && values.includes(String(preferredValue))) {
                selectEl.value = String(preferredValue);
            } else {
                selectEl.value = '';
            }
        };

        const renderCompareEducationLevelSelect = (selectEl, levels, preferredValue = '') => {
            if (!selectEl) return;
            const values = Array.from(new Set((levels || []).filter(Boolean)));
            if (!values.length) {
                selectEl.innerHTML = '<option value="">Нет уровней</option>';
                selectEl.value = '';
                selectEl.disabled = true;
                return;
            }
            selectEl.disabled = false;
            selectEl.innerHTML = values.map(level => (
                `<option value="${level}">${formatEducationLevelLabel(level)}</option>`
            )).join('');
            if (preferredValue && values.includes(String(preferredValue))) {
                selectEl.value = String(preferredValue);
            } else {
                selectEl.value = String(values[0]);
            }
        };

        const syncCompareEducationLevelSelectors = (options = {}) => {
            const resetSelection = Boolean(options.resetSelection);
            const syncFromTopFilters = Boolean(options.syncFromTopFilters);
            const preferredLevel = String(options.preferredLevel || '');
            const availableLevels = uniqueSorted(
                getCompareBaseScope().map(item => String(item.educationLevel || '')).filter(Boolean),
                educationLevelOrder
            );
            const topLevel = String(educationLevelSelect.value || '');
            const currentLeft = String(compareLeftEducationLevelEl?.value || '');
            const currentRight = String(compareRightEducationLevelEl?.value || '');

            let targetLevel = '';
            if (preferredLevel && availableLevels.includes(preferredLevel)) {
                targetLevel = preferredLevel;
            } else if (syncFromTopFilters && topLevel && availableLevels.includes(topLevel)) {
                targetLevel = topLevel;
            } else if (!resetSelection && currentLeft && availableLevels.includes(currentLeft)) {
                targetLevel = currentLeft;
            } else if (!resetSelection && currentRight && availableLevels.includes(currentRight)) {
                targetLevel = currentRight;
            } else if (topLevel && availableLevels.includes(topLevel)) {
                targetLevel = topLevel;
            } else if (availableLevels.length > 0) {
                targetLevel = availableLevels[0];
            }

            renderCompareEducationLevelSelect(compareLeftEducationLevelEl, availableLevels, targetLevel);
            renderCompareEducationLevelSelect(compareRightEducationLevelEl, availableLevels, targetLevel);
        };

        const getSelectableYearsForCompareVariant = (directionId, variant = {}) => {
            const years = getYearsForCompareVariant(directionId, variant);
            if (!years.length) return [];
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            return buildYearRangeDesc(minYear, maxYear);
        };

        const renderComparePlanYearSelect = (selectEl, directionId, variant = {}, preferredYear = null) => {
            if (!selectEl) return;
            const years = getSelectableYearsForCompareVariant(directionId, variant);
            if (!Number(directionId) || !years.length) {
                selectEl.innerHTML = '<option value="">Год</option>';
                selectEl.value = '';
                selectEl.disabled = true;
                return;
            }

            selectEl.disabled = false;
            selectEl.innerHTML = years.map(year => (
                `<option value="${year}">${formatComparePlanYearLabel(directionId, year, variant)}</option>`
            )).join('');

            const normalizedPreferredYear = Number(preferredYear);
            if (Number.isFinite(normalizedPreferredYear) && years.includes(normalizedPreferredYear)) {
                selectEl.value = String(normalizedPreferredYear);
            } else {
                selectEl.value = String(years[0]);
            }
        };

        const syncCompareDirectionSelectors = (options = {}) => {
            const resetSelection = Boolean(options.resetSelection);
            const syncToTopDirection = Boolean(options.syncToTopDirection);
            const leftVariant = readCompareVariant('left');
            const rightVariant = readCompareVariant('right');
            const topDirectionId = Number(directionSelect.value || 0);

            const leftOptions = getCompareDirectionOptions(leftVariant);
            const rightOptions = getCompareDirectionOptions(rightVariant);

            const preferredLeftDirection = resetSelection
                ? topDirectionId
                : Number(compareLeftDirectionEl.value || directionSelect.value || 0);
            renderCompareDirectionSelect(compareLeftDirectionEl, leftOptions, preferredLeftDirection);

            const canSyncToTop = syncToTopDirection
                && topDirectionId > 0
                && rightOptions.some(option => Number(option.id) === topDirectionId);
            if (canSyncToTop) {
                renderCompareDirectionSelect(compareRightDirectionEl, rightOptions, topDirectionId);
            } else {
                const currentRightDirection = resetSelection ? 0 : Number(compareRightDirectionEl.value || 0);
                const rightPreferred = rightOptions.some(option => Number(option.id) === currentRightDirection)
                    ? currentRightDirection
                    : null;
                const rightDefault = rightPreferred
                    ? {id: rightPreferred}
                    : (rightOptions.find(option => Number(option.id) !== Number(compareLeftDirectionEl.value)) || rightOptions[0]);
                renderCompareDirectionSelect(compareRightDirectionEl, rightOptions, rightDefault?.id);
            }

            const normalizedLeftVariant = readCompareVariant('left');
            const normalizedRightVariant = readCompareVariant('right');

            const leftScope = getCompareScopeByVariant({
                directionId: Number(compareLeftDirectionEl.value || 0),
                educationLevel: normalizedLeftVariant.educationLevel,
                educationForm: normalizedLeftVariant.educationForm,
                acceleratedOnly: false
            });
            const rightScope = getCompareScopeByVariant({
                directionId: Number(compareRightDirectionEl.value || 0),
                educationLevel: normalizedRightVariant.educationLevel,
                educationForm: normalizedRightVariant.educationForm,
                acceleratedOnly: false
            });
            const leftHasAccelerated = leftScope.some(item => Boolean(item.accelerated));
            const rightHasAccelerated = rightScope.some(item => Boolean(item.accelerated));
            if (compareLeftAcceleratedEl) {
                compareLeftAcceleratedEl.disabled = !leftHasAccelerated;
                if (!leftHasAccelerated) compareLeftAcceleratedEl.checked = false;
            }
            if (compareRightAcceleratedEl) {
                compareRightAcceleratedEl.disabled = !rightHasAccelerated;
                if (!rightHasAccelerated) compareRightAcceleratedEl.checked = false;
            }
        };

        const syncComparePlanYearSelectors = (options = {}) => {
            const resetSelection = Boolean(options.resetSelection);
            const leftVariant = readCompareVariant('left');
            const rightVariant = readCompareVariant('right');
            const leftDirectionId = Number(compareLeftDirectionEl?.value || 0);
            const rightDirectionId = Number(compareRightDirectionEl?.value || 0);

            const preferredLeftYear = resetSelection ? null : Number(compareLeftPlanYearEl?.value || 0);
            const preferredRightYear = resetSelection ? null : Number(compareRightPlanYearEl?.value || 0);

            renderComparePlanYearSelect(compareLeftPlanYearEl, leftDirectionId, leftVariant, preferredLeftYear);
            renderComparePlanYearSelect(compareRightPlanYearEl, rightDirectionId, rightVariant, preferredRightYear);
        };

        const syncCompareControls = (options = {}) => {
            syncCompareEducationLevelSelectors(options);
            syncCompareDirectionSelectors(options);
            syncComparePlanYearSelectors(options);
        };

        const resolveCompareYears = (leftDirectionId, leftVariant, rightDirectionId, rightVariant) => {
            const sameDirectionMode = leftDirectionId > 0
                && rightDirectionId > 0
                && Number(leftDirectionId) === Number(rightDirectionId);
            const sameVariant = sameDirectionMode
                && String(leftVariant.educationForm || '') === String(rightVariant.educationForm || '')
                && Boolean(leftVariant.acceleratedOnly) === Boolean(rightVariant.acceleratedOnly);

            if (sameVariant) {
                const years = getYearsForCompareVariant(leftDirectionId, leftVariant);
                return {
                    leftYear: years[0] || null,
                    rightYear: years[1] || years[0] || null,
                    sameDirectionMode,
                    yearModeText: years.length > 1
                        ? 'сравнение двух редакций одного направления'
                        : 'сравнение одной доступной редакции'
                };
            }

            const sharedYears = getSharedYearsForVariants(leftDirectionId, leftVariant, rightDirectionId, rightVariant);
            if (sharedYears.length > 0) {
                return {
                    leftYear: sharedYears[0],
                    rightYear: sharedYears[0],
                    sameDirectionMode,
                    yearModeText: 'общий учебный год для двух направлений'
                };
            }

            const leftYears = getYearsForCompareVariant(leftDirectionId, leftVariant);
            const rightYears = getYearsForCompareVariant(rightDirectionId, rightVariant);
            return {
                leftYear: leftYears[0] || null,
                rightYear: rightYears[0] || null,
                sameDirectionMode,
                yearModeText: 'сравнение актуальных доступных редакций'
            };
        };

        const getCompareRows = (directionId, requestedYear, variant = {}) => {
            const normalizedDirectionId = Number(directionId);
            if (!normalizedDirectionId) {
                return [];
            }
            const effectivePlanYear = getEffectivePlanYearForVariant(normalizedDirectionId, requestedYear, variant);
            if (!effectivePlanYear) {
                return [];
            }
            return dedupeCurriculums(
                getCompareScopeByVariant({...variant, directionId: normalizedDirectionId})
                    .filter(item => Number(item.planYear) === Number(effectivePlanYear)),
                false
            );
        };

        const curriculumCompareKey = (item) => [
            Number(item.course) || 0,
            Number(item.semester) || 0,
            normalizeDiscipline(item.discipline).toLowerCase(),
            Number(item.hours) || 0,
            String(item.attestation || ''),
            Boolean(item.courseWork) ? '1' : '0'
        ].join('|');

        const buildComparePairs = (leftRows, rightRows) => {
            const leftMap = new Map();
            leftRows.forEach(row => leftMap.set(curriculumCompareKey(row), row));
            const rightMap = new Map();
            rightRows.forEach(row => rightMap.set(curriculumCompareKey(row), row));
            const sortRows = (rows) => [...rows].sort((left, right) => {
                const courseCmp = (Number(left?.course) || 0) - (Number(right?.course) || 0);
                if (courseCmp !== 0) return courseCmp;
                const semesterCmp = (Number(left?.semester) || 0) - (Number(right?.semester) || 0);
                if (semesterCmp !== 0) return semesterCmp;
                return compareText(normalizeDiscipline(left?.discipline), normalizeDiscipline(right?.discipline));
            });

            const commonRows = sortRows(
                Array.from(leftMap.keys())
                    .filter(key => rightMap.has(key))
                    .map(key => leftMap.get(key))
                    .filter(Boolean)
            );
            const commonPairs = commonRows.map(row => {
                const key = curriculumCompareKey(row);
                return {
                    left: row,
                    right: rightMap.get(key) || null,
                    status: 'both'
                };
            });

            const leftOnly = sortRows(
                Array.from(leftMap.keys())
                    .filter(key => !rightMap.has(key))
                    .map(key => leftMap.get(key))
                    .filter(Boolean)
            );
            const rightOnly = sortRows(
                Array.from(rightMap.keys())
                    .filter(key => !leftMap.has(key))
                    .map(key => rightMap.get(key))
                    .filter(Boolean)
            );

            const diffPairs = [];
            const diffMax = Math.max(leftOnly.length, rightOnly.length);
            for (let i = 0; i < diffMax; i += 1) {
                const left = leftOnly[i] || null;
                const right = rightOnly[i] || null;
                diffPairs.push({
                    left,
                    right,
                    status: left && right ? 'diff' : left ? 'left-only' : 'right-only'
                });
            }

            const pairs = [...commonPairs, ...diffPairs];
            return pairs.filter(pair => !compareState.showOnlyDifference || pair.status !== 'both');
        };

        const renderCompareRows = (pairs, side) => {
            if (!pairs.length) {
                return '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
            }
            return pairs.map(pair => {
                const row = side === 'left' ? pair.left : pair.right;
                const rowClass = !row
                    ? 'curriculum-row-empty'
                    : pair.status === 'both'
                        ? 'curriculum-row-match'
                        : 'curriculum-row-diff';
                if (!row) {
                    return `<tr class="${rowClass}">
                        <td colspan="4" class="text-center text-muted">-</td>
                    </tr>`;
                }
                return `<tr class="${rowClass}">
                    <td class="col-semester">${safeValue(row.semester)}</td>
                    <td class="col-discipline fw-semibold">${safeValue(row.discipline)}</td>
                    <td class="col-hours">${safeValue(row.hours)}</td>
                    <td class="col-attestation">${escapeHtml(curriculumAttestationLabel(row))}</td>
                </tr>`;
            }).join('');
        };

        const renderCompareCourseTabs = () => {
            const courses = Array.from(
                new Set([
                    ...compareState.leftRows.map(row => Number(row.course) || 0),
                    ...compareState.rightRows.map(row => Number(row.course) || 0)
                ].filter(value => value > 0))
            ).sort((left, right) => left - right);

            if (!courses.length) {
                compareState.selectedCourse = null;
                compareCourseTabsEl.innerHTML = '<div class="text-muted small">Курсы не найдены</div>';
                compareSemesterTabsEl.innerHTML = '';
                return;
            }

            if (!courses.includes(Number(compareState.selectedCourse))) {
                compareState.selectedCourse = courses[0];
                compareState.selectedSemester = 'all';
            }

            compareCourseTabsEl.innerHTML = courses.map(course => `
                <button type="button" class="nav-link ${Number(compareState.selectedCourse) === Number(course) ? 'active' : ''}" data-compare-course="${course}">
                    ${course} курс
                </button>
            `).join('');
        };

        const renderCompareSemesterTabs = () => {
            if (!compareState.selectedCourse) {
                compareSemesterTabsEl.innerHTML = '';
                compareState.selectedSemester = 'all';
                return;
            }
            const firstSemester = Number(compareState.selectedCourse) * 2 - 1;
            const secondSemester = Number(compareState.selectedCourse) * 2;
            const tabs = [
                {id: 'all', label: 'Все'},
                {id: String(firstSemester), label: `${firstSemester} семестр`},
                {id: String(secondSemester), label: `${secondSemester} семестр`}
            ];
            if (!tabs.some(tab => tab.id === compareState.selectedSemester)) {
                compareState.selectedSemester = 'all';
            }
            compareSemesterTabsEl.innerHTML = tabs.map(tab => `
                <button type="button" class="nav-link ${compareState.selectedSemester === tab.id ? 'active' : ''}" data-compare-semester="${tab.id}">
                    ${tab.label}
                </button>
            `).join('');
        };

        const renderCompareTables = () => {
            const left = compareState.leftRows
                .filter(row => !compareState.selectedCourse || Number(row.course) === Number(compareState.selectedCourse))
                .filter(row => compareState.selectedSemester === 'all' || String(row.semester) === compareState.selectedSemester);
            const right = compareState.rightRows
                .filter(row => !compareState.selectedCourse || Number(row.course) === Number(compareState.selectedCourse))
                .filter(row => compareState.selectedSemester === 'all' || String(row.semester) === compareState.selectedSemester);
            const pairs = buildComparePairs(left, right);
            compareLeftTableEl.innerHTML = renderCompareRows(pairs, 'left');
            compareRightTableEl.innerHTML = renderCompareRows(pairs, 'right');
            compareToggleDiffBtn.textContent = compareState.showOnlyDifference ? 'Показать все' : 'Разница';
        };

        const applyCompare = (options = {}) => {
            const silent = Boolean(options.silent);
            const leftDirectionId = Number(compareLeftDirectionEl.value);
            const rightDirectionId = Number(compareRightDirectionEl.value);
            const leftRequestedYear = Number(compareLeftPlanYearEl?.value || 0);
            const rightRequestedYear = Number(compareRightPlanYearEl?.value || 0);
            const leftVariant = readCompareVariant('left');
            const rightVariant = readCompareVariant('right');

            if (leftVariant.educationLevel && rightVariant.educationLevel
                && String(leftVariant.educationLevel) !== String(rightVariant.educationLevel)) {
                if (!silent) {
                    toast('Сравнение возможно только для одинакового уровня образования.', 'warning');
                }
                return false;
            }

            if (!leftDirectionId || !rightDirectionId) {
                if (!silent) {
                    toast('Выберите направления для сравнения.', 'warning');
                }
                resetCompareView();
                if (comparePanelMetaEl) {
                    comparePanelMetaEl.textContent = 'Для сравнения выберите доступные направления.';
                }
                return false;
            }

            compareState.leftRows = getCompareRows(leftDirectionId, leftRequestedYear, leftVariant);
            compareState.rightRows = getCompareRows(rightDirectionId, rightRequestedYear, rightVariant);
            if (!compareState.leftRows.length && !compareState.rightRows.length) {
                resetCompareView();
                if (comparePanelMetaEl) {
                    comparePanelMetaEl.textContent = 'Недостаточно данных для сравнения по выбранным фильтрам.';
                }
                if (!silent) {
                    toast('Недостаточно данных для сравнения по выбранным фильтрам.', 'warning');
                }
                return false;
            }

            if (!leftRequestedYear || !rightRequestedYear) {
                resetCompareView();
                if (comparePanelMetaEl) {
                    comparePanelMetaEl.textContent = 'Недостаточно данных для сравнения по выбранным фильтрам.';
                }
                if (!silent) {
                    toast('Недостаточно данных для сравнения по выбранным фильтрам.', 'warning');
                }
                return false;
            }

            compareState.selectedCourse = null;
            compareState.selectedSemester = 'all';
            compareState.sameDirectionMode = leftDirectionId > 0
                && rightDirectionId > 0
                && Number(leftDirectionId) === Number(rightDirectionId);

            const leftDirectionText = compareLeftDirectionEl.options[compareLeftDirectionEl.selectedIndex]?.text || '';
            const rightDirectionText = compareRightDirectionEl.options[compareRightDirectionEl.selectedIndex]?.text || '';
            const leftVariantText = buildCompareVariantLabel(leftVariant);
            const rightVariantText = buildCompareVariantLabel(rightVariant);
            compareLeftLabelEl.textContent = `${leftDirectionText} • ${leftVariantText} • ${formatComparePlanYearLabel(leftDirectionId, leftRequestedYear, leftVariant)}`;
            compareRightLabelEl.textContent = `${rightDirectionText} • ${rightVariantText} • ${formatComparePlanYearLabel(rightDirectionId, rightRequestedYear, rightVariant)}`;

            const facultyText = facultySelect.options[facultySelect.selectedIndex]?.text || '';
            const compareLevelValue = leftVariant.educationLevel || rightVariant.educationLevel || educationLevelSelect.value;
            const levelText = compareLevelValue ? formatEducationLevelLabel(compareLevelValue) : '';
            const metaParts = [];
            if (facultyText) {
                metaParts.push(`Факультет: ${facultyText}`);
            }
            if (levelText) {
                metaParts.push(levelText);
            }
            comparePanelMetaEl.textContent = metaParts.join(' • ');

            renderCompareCourseTabs();
            renderCompareSemesterTabs();
            renderCompareTables();
            return true;
        };

        const refreshComparePanel = (refreshOptions = {}) => {
            const resetSelection = Boolean(refreshOptions.resetSelection);
            const syncFromTopFilters = Boolean(refreshOptions.syncFromTopFilters);
            const syncToTopDirection = Boolean(refreshOptions.syncToTopDirection);
            const preferredLevel = String(refreshOptions.preferredLevel || '');
            const compareScope = getCompareBaseScope();

            if (!compareScope.length) {
                if (compareLeftEducationLevelEl) {
                    compareLeftEducationLevelEl.innerHTML = '<option value="">Нет уровней</option>';
                    compareLeftEducationLevelEl.value = '';
                    compareLeftEducationLevelEl.disabled = true;
                }
                if (compareRightEducationLevelEl) {
                    compareRightEducationLevelEl.innerHTML = '<option value="">Нет уровней</option>';
                    compareRightEducationLevelEl.value = '';
                    compareRightEducationLevelEl.disabled = true;
                }
                if (compareLeftEducationFormEl) {
                    compareLeftEducationFormEl.innerHTML = '<option value="">Все формы</option>';
                    compareLeftEducationFormEl.value = '';
                    compareLeftEducationFormEl.disabled = true;
                }
                if (compareRightEducationFormEl) {
                    compareRightEducationFormEl.innerHTML = '<option value="">Все формы</option>';
                    compareRightEducationFormEl.value = '';
                    compareRightEducationFormEl.disabled = true;
                }
                compareLeftDirectionEl.innerHTML = '<option value="">Нет доступных направлений</option>';
                compareRightDirectionEl.innerHTML = '<option value="">Нет доступных направлений</option>';
                compareLeftDirectionEl.disabled = true;
                compareRightDirectionEl.disabled = true;
                if (compareLeftPlanYearEl) {
                    compareLeftPlanYearEl.innerHTML = '<option value="">Год</option>';
                    compareLeftPlanYearEl.value = '';
                    compareLeftPlanYearEl.disabled = true;
                }
                if (compareRightPlanYearEl) {
                    compareRightPlanYearEl.innerHTML = '<option value="">Год</option>';
                    compareRightPlanYearEl.value = '';
                    compareRightPlanYearEl.disabled = true;
                }
                if (compareLeftLabelEl) {
                    compareLeftLabelEl.textContent = 'Левый учебный план';
                }
                if (compareRightLabelEl) {
                    compareRightLabelEl.textContent = 'Правый учебный план';
                }
                if (comparePanelMetaEl) {
                    comparePanelMetaEl.textContent = facultySelect.value
                        ? 'Недостаточно данных для сравнения. Выберите направление и параметры.'
                        : 'Для сравнения сначала выберите факультет в верхнем фильтре.';
                }
                resetCompareView();
                return;
            }

            syncCompareEducationLevelSelectors({resetSelection, syncFromTopFilters, preferredLevel});

            const topForm = String(educationFormSelect.value || '');
            const leftLevel = String(compareLeftEducationLevelEl?.value || '');
            const rightLevel = String(compareRightEducationLevelEl?.value || '');
            const leftForms = uniqueSorted(
                compareScope
                    .filter(item => !leftLevel || String(item.educationLevel || '') === leftLevel)
                    .map(item => String(item.educationForm || ''))
                    .filter(Boolean),
                educationFormOrder
            );
            const rightForms = uniqueSorted(
                compareScope
                    .filter(item => !rightLevel || String(item.educationLevel || '') === rightLevel)
                    .map(item => String(item.educationForm || ''))
                    .filter(Boolean),
                educationFormOrder
            );
            const leftFormPreferred = syncFromTopFilters
                ? topForm
                : (resetSelection ? '' : compareLeftEducationFormEl?.value);
            const rightFormPreferred = syncFromTopFilters
                ? topForm
                : (resetSelection ? '' : compareRightEducationFormEl?.value);
            renderCompareFormSelect(compareLeftEducationFormEl, leftForms, leftFormPreferred);
            renderCompareFormSelect(compareRightEducationFormEl, rightForms, rightFormPreferred);

            if (compareLeftEducationFormEl) {
                compareLeftEducationFormEl.disabled = false;
            }
            if (compareRightEducationFormEl) {
                compareRightEducationFormEl.disabled = false;
            }

            if (compareLeftAcceleratedEl) {
                compareLeftAcceleratedEl.checked = syncFromTopFilters
                    ? Boolean(acceleratedCheckbox.checked)
                    : (resetSelection ? false : compareLeftAcceleratedEl.checked);
            }
            if (compareRightAcceleratedEl) {
                compareRightAcceleratedEl.checked = syncFromTopFilters
                    ? Boolean(acceleratedCheckbox.checked)
                    : (resetSelection ? false : compareRightAcceleratedEl.checked);
            }

            syncCompareControls({resetSelection, syncFromTopFilters, syncToTopDirection});
            compareState.showOnlyDifference = false;
            applyCompare({silent: true});
        };

        if (comparePanelEl) {
            comparePanelEl.classList.remove('d-none');
        }

        facultySelect.addEventListener('change', () => {
            loadDirections(facultySelect.value).then(() => {
                directionSelect.value = '';
                updateDependentFilters();
                invalidatePlan();
            }).catch(err => toast(err.message, 'danger'));
        });
        directionSelect.addEventListener('change', () => {
            updateDependentFilters();
            refreshComparePanel({
                resetSelection: true,
                syncToTopDirection: true,
                syncFromTopFilters: true
            });
            showPlan({silent: true});
        });
        educationLevelSelect.addEventListener('change', () => {
            updateDependentFilters();
            applyTopPlanFiltersInstantly();
        });
        educationFormSelect.addEventListener('change', () => {
            updateDependentFilters();
            applyTopPlanFiltersInstantly();
        });
        acceleratedCheckbox.addEventListener('change', applyTopPlanFiltersInstantly);

        if (showBtn) {
            showBtn.addEventListener('click', showPlan);
        }

        if (planYearSelect) {
            planYearSelect.addEventListener('change', () => {
                selectedPlanYear = planYearSelect.value === 'all'
                    ? 'all'
                    : (Number(planYearSelect.value) || null);
                appliedCurriculums = getRowsForSelectedYear();
                selectedCourse = null;
                selectedSemester = 'all';
                renderAppliedPlan();
            });
        }

        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                facultySelect.value = '';
                directionSelect.value = '';
                educationLevelSelect.value = '';
                educationFormSelect.value = '';
                acceleratedCheckbox.checked = false;
                loadDirections().then(() => {
                    directionSelect.value = '';
                    updateDependentFilters();
                    invalidatePlan();
                    refreshComparePanel();
                }).catch(err => toast(err.message, 'danger'));
            });
        }

        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadCurriculums().then(() => {
                    updateDependentFilters();
                    if (!resultCardEl.classList.contains('d-none')) {
                        showPlan();
                    } else {
                        hideResult();
                    }
                    refreshComparePanel();
                }).catch(err => toast(err.message, 'danger'));
            });
        }

        courseTabsEl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-course]');
            if (!button) return;
            selectedCourse = Number(button.dataset.course);
            selectedSemester = 'all';
            buildCourseTabs();
            buildSemesterTabs();
            renderPlanTable();
        });

        semesterTabsEl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-semester]');
            if (!button) return;
            selectedSemester = String(button.dataset.semester);
            buildSemesterTabs();
            renderPlanTable();
        });

        if (compareLeftDirectionEl) {
            compareLeftDirectionEl.addEventListener('change', () => {
                syncCompareControls();
                applyCompare();
            });
        }
        if (compareRightDirectionEl) {
            compareRightDirectionEl.addEventListener('change', () => {
                syncCompareControls();
                applyCompare();
            });
        }
        if (compareLeftEducationFormEl) {
            compareLeftEducationFormEl.addEventListener('change', () => {
                syncCompareControls();
                applyCompare();
            });
        }
        if (compareRightEducationFormEl) {
            compareRightEducationFormEl.addEventListener('change', () => {
                syncCompareControls();
                applyCompare();
            });
        }
        if (compareLeftEducationLevelEl) {
            compareLeftEducationLevelEl.addEventListener('change', () => {
                syncCompareControls({preferredLevel: compareLeftEducationLevelEl.value});
                applyCompare();
            });
        }
        if (compareRightEducationLevelEl) {
            compareRightEducationLevelEl.addEventListener('change', () => {
                syncCompareControls({preferredLevel: compareRightEducationLevelEl.value});
                applyCompare();
            });
        }
        if (compareLeftPlanYearEl) {
            compareLeftPlanYearEl.addEventListener('change', () => {
                applyCompare();
            });
        }
        if (compareRightPlanYearEl) {
            compareRightPlanYearEl.addEventListener('change', () => {
                applyCompare();
            });
        }
        if (compareLeftAcceleratedEl) {
            compareLeftAcceleratedEl.addEventListener('change', () => {
                syncCompareControls();
                applyCompare();
            });
        }
        if (compareRightAcceleratedEl) {
            compareRightAcceleratedEl.addEventListener('change', () => {
                syncCompareControls();
                applyCompare();
            });
        }
        if (compareToggleDiffBtn) {
            compareToggleDiffBtn.addEventListener('click', () => {
                compareState.showOnlyDifference = !compareState.showOnlyDifference;
                renderCompareTables();
            });
        }
        if (compareResetBtn) {
            compareResetBtn.addEventListener('click', () => {
                compareState.showOnlyDifference = false;
                refreshComparePanel({resetSelection: true});
            });
        }
        if (compareCourseTabsEl) {
            compareCourseTabsEl.addEventListener('click', (event) => {
                const button = event.target.closest('[data-compare-course]');
                if (!button) return;
                compareState.selectedCourse = Number(button.dataset.compareCourse);
                compareState.selectedSemester = 'all';
                renderCompareCourseTabs();
                renderCompareSemesterTabs();
                renderCompareTables();
            });
        }
        if (compareSemesterTabsEl) {
            compareSemesterTabsEl.addEventListener('click', (event) => {
                const button = event.target.closest('[data-compare-semester]');
                if (!button) return;
                compareState.selectedSemester = String(button.dataset.compareSemester || 'all');
                renderCompareSemesterTabs();
                renderCompareTables();
            });
        }

        (async () => {
            await loadFaculties();
            await loadDirections();
            await loadCurriculums();
            updateDependentFilters();
            hideResult();
            refreshComparePanel();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Приказы =====
    function initOrdersPage() {
        const page = document.getElementById('ordersPage');
        if (!page) return;

        const table = document.getElementById('ordersTable');
        const dateFromEl = document.getElementById('orderDateFrom');
        const dateToEl = document.getElementById('orderDateTo');
        const dateFromPickerBtn = document.getElementById('orderDateFromPicker');
        const dateToPickerBtn = document.getElementById('orderDateToPicker');
        const typeFilterEl = document.getElementById('orderTypeFilter');
        const statusFilterEl = document.getElementById('orderStatusFilter');
        const sortEl = document.getElementById('orderSort');
        const reloadBtn = document.getElementById('reloadOrders');
        const applyBtn = document.getElementById('applyOrderFilters');
        const resetBtn = document.getElementById('resetOrderFilters');
        const pageSizeSelect = document.getElementById('ordersPageSize');
        const pageFirst = document.getElementById('ordersPageFirst');
        const pagePrev = document.getElementById('ordersPagePrev');
        const pageNumbers = document.getElementById('ordersPageNumbers');
        const pageNext = document.getElementById('ordersPageNext');
        const pageLast = document.getElementById('ordersPageLast');
        let allOrders = [];
        let filteredOrders = [];
        let currentPage = 0;
        let lastTotalPages = 1;

        const compareText = (left, right) => {
            const a = String(left || '');
            const b = String(right || '');
            return a.localeCompare(b, 'ru-RU', {numeric: true, sensitivity: 'base'});
        };

        const compareDateDesc = (left, right) => {
            const dateCmp = compareText(right.orderDate, left.orderDate);
            if (dateCmp !== 0) return dateCmp;
            return (Number(right.id) || 0) - (Number(left.id) || 0);
        };

        const compareDateAsc = (left, right) => {
            const dateCmp = compareText(left.orderDate, right.orderDate);
            if (dateCmp !== 0) return dateCmp;
            return (Number(left.id) || 0) - (Number(right.id) || 0);
        };

        const compareOrders = (left, right) => {
            const mode = sortEl.value || 'date_desc';
            if (mode === 'date_asc') {
                return compareDateAsc(left, right);
            }
            if (mode === 'number_asc') {
                const numberCmp = compareText(left.number, right.number);
                return numberCmp !== 0 ? numberCmp : compareDateDesc(left, right);
            }
            if (mode === 'number_desc') {
                const numberCmp = compareText(right.number, left.number);
                return numberCmp !== 0 ? numberCmp : compareDateDesc(left, right);
            }
            return compareDateDesc(left, right);
        };

        const executableTypes = new Set([
            'TRANSFER_NEXT_COURSE',
            'TRANSFER_DIRECTION',
            'ACADEMIC_LEAVE',
            'EXPULSION',
            'ENROLLMENT'
        ]);

        const isExecutableOrder = (order) => executableTypes.has(String(order?.type || ''));
        const isExecutedOrder = (order) => order?.executed === true;
        const isSignedOrder = (order) => order?.signed === true;
        const getOrderStatusFilterValue = (order) => {
            if (isSignedOrder(order)) return 'SIGNED';
            if (isExecutedOrder(order)) return 'EXECUTED';
            return 'DRAFT';
        };

        const renderOrderStatus = (order) => {
            if (isSignedOrder(order)) {
                const signedDate = order.signedAt ? formatIsoDateToRu(order.signedAt) : '';
                return `<span class="badge text-bg-dark">${signedDate ? `Подписан ${signedDate}` : 'Подписан'}</span>`;
            }
            if (!isExecutedOrder(order)) {
                return '<span class="badge text-bg-secondary">Черновик</span>';
            }
            const executedDate = order.executedAt ? formatIsoDateToRu(order.executedAt) : '';
            return `<span class="badge text-bg-success">${executedDate ? `Осуществлён ${executedDate}` : 'Осуществлён'}</span>`;
        };

        const renderOrderActions = (order) => {
            const actions = [
                `<a class="btn-circle" href="/api/orders/${order.id}/pdf" target="_blank" title="Печать PDF"><i class="bi bi-printer"></i></a>`
            ];

            if (!isExecutedOrder(order) && !isSignedOrder(order)) {
                actions.push(`<a class="btn-circle" href="/order-form.html?id=${order.id}" title="Редактировать"><i class="bi bi-pencil"></i></a>`);
            } else {
                actions.push(`<a class="btn-circle" href="/order-form.html?id=${order.id}" title="Просмотр"><i class="bi bi-eye"></i></a>`);
            }

            if (isExecutableOrder(order) && !isExecutedOrder(order) && !isSignedOrder(order)) {
                actions.push(`<button class="btn-circle text-success" data-action="execute" title="Осуществить"><i class="bi bi-play-fill"></i></button>`);
            }
            if (isExecutableOrder(order) && isExecutedOrder(order) && !isSignedOrder(order)) {
                actions.push(`<button class="btn-circle text-warning" data-action="rollback" title="Откатить"><i class="bi bi-arrow-counterclockwise"></i></button>`);
            }
            if (isExecutedOrder(order) && !isSignedOrder(order)) {
                actions.push(`<button class="btn-circle text-dark" data-action="sign" title="Подписать"><i class="bi bi-pen"></i></button>`);
            }

            actions.push(`<button class="btn-circle text-danger" data-action="delete" title="Удалить"><i class="bi bi-trash"></i></button>`);

            return actions.join('');
        };

        const renderOrdersPage = () => {
            const paged = paginateLocal(filteredOrders, currentPage, Number(pageSizeSelect.value) || 10);
            currentPage = paged.page;
            lastTotalPages = paged.totalPages;
            const visibleOrders = paged.content;

            table.innerHTML = visibleOrders.length === 0
                ? `<tr><td colspan="6" class="text-center text-muted py-4">Нет приказов</td></tr>`
                : visibleOrders.map(order => `<tr data-id="${order.id}">
                    <td class="text-muted col-id">${order.id}</td>
                    <td class="fw-semibold col-number">${order.number}</td>
                    <td class="col-date">${order.orderDate}</td>
                    <td class="col-type">${getOrderTypeLabel(order.type)}</td>
                    <td class="col-status">${renderOrderStatus(order)}</td>
                    <td class="text-end col-actions">
                        <div class="table-actions justify-content-end">
                            ${renderOrderActions(order)}
                        </div>
                    </td>
                </tr>`).join('');
            bindActions();
            renderPaginationControls({
                page: currentPage,
                totalPages: lastTotalPages,
                firstBtn: pageFirst,
                prevBtn: pagePrev,
                numbersEl: pageNumbers,
                nextBtn: pageNext,
                lastBtn: pageLast
            });
        };

        const applyFiltersAndRender = () => {
            const dateFrom = parseDateInputToIso(dateFromEl.value);
            const dateTo = parseDateInputToIso(dateToEl.value);
            const type = typeFilterEl.value;
            const status = statusFilterEl ? statusFilterEl.value : '';

            if (dateFrom === undefined || dateTo === undefined) {
                toast('Некорректная дата. Используйте формат дд.мм.гггг или гггг-мм-дд.', 'danger');
                return;
            }
            if (dateFrom) {
                dateFromEl.value = formatIsoDateToRu(dateFrom);
            }
            if (dateTo) {
                dateToEl.value = formatIsoDateToRu(dateTo);
            }
            if (dateFrom && dateTo && dateFrom > dateTo) {
                toast('Период задан неверно: дата "с" больше даты "по".', 'danger');
                return;
            }

            filteredOrders = allOrders
                .filter(order => !type || order.type === type)
                .filter(order => !status || getOrderStatusFilterValue(order) === status)
                .filter(order => !dateFrom || (order.orderDate && order.orderDate >= dateFrom))
                .filter(order => !dateTo || (order.orderDate && order.orderDate <= dateTo))
                .sort(compareOrders);

            renderOrdersPage();
        };

        const loadOrders = async () => {
            allOrders = await api('/api/orders');
            currentPage = 0;
            applyFiltersAndRender();
        };

        const bindActions = () => {
            table.querySelectorAll('[data-action="execute"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    if (await confirmAction({
                        title: 'Осуществление приказа',
                        message: 'Осуществить приказ? Изменения статусов и переводов будут применены к студентам.',
                        confirmText: 'Осуществить',
                        confirmClass: 'btn-dark'
                    })) {
                        await api(`/api/orders/${id}/execute`, {method: 'POST'});
                        toast('Приказ осуществлён');
                        await loadOrders();
                    }
                });
            });

            table.querySelectorAll('[data-action="rollback"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    if (await confirmAction({
                        title: 'Откат приказа',
                        message: 'Откатить осуществлённый приказ и вернуть изменения студентов в исходное состояние?',
                        confirmText: 'Откатить',
                        confirmClass: 'btn-warning'
                    })) {
                        await api(`/api/orders/${id}/rollback`, {method: 'POST'});
                        toast('Приказ откатан');
                        await loadOrders();
                    }
                });
            });

            table.querySelectorAll('[data-action="sign"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    if (await confirmAction({
                        title: 'Подписание приказа',
                        message: 'Подписать приказ? После подписания его нельзя будет изменить.',
                        confirmText: 'Подписать',
                        confirmClass: 'btn-dark'
                    })) {
                        await api(`/api/orders/${id}/sign`, {method: 'POST'});
                        toast('Приказ подписан');
                        await loadOrders();
                    }
                });
            });

            table.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const order = allOrders.find(item => String(item.id) === String(id));
                    const deleteMessage = order && (Boolean(order.signed) || Boolean(order.executed))
                        ? 'Удалить осуществлённый/подписанный приказ? Изменения студентов, уже внесённые этим приказом, сохранятся.'
                        : 'Удалить приказ?';
                    if (await confirmAction({title: 'Удаление приказа', message: deleteMessage, confirmText: 'Удалить'})) {
                        await api(`/api/orders/${id}`, {method: 'DELETE'});
                        toast('Приказ удалён');
                        await loadOrders();
                    }
                });
            });
        };

        applyBtn.addEventListener('click', () => {
            currentPage = 0;
            applyFiltersAndRender();
        });
        resetBtn.addEventListener('click', () => {
            dateFromEl.value = '';
            dateToEl.value = '';
            typeFilterEl.value = '';
            if (statusFilterEl) {
                statusFilterEl.value = '';
            }
            sortEl.value = 'date_desc';
            currentPage = 0;
            applyFiltersAndRender();
        });
        sortEl.addEventListener('change', () => {
            currentPage = 0;
            applyFiltersAndRender();
        });
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadOrders().catch(err => toast(err.message, 'danger'));
            });
        }
        pageSizeSelect.addEventListener('change', () => {
            currentPage = 0;
            renderOrdersPage();
        });
        pageFirst.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage = 0;
                renderOrdersPage();
            }
        });
        pagePrev.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage -= 1;
                renderOrdersPage();
            }
        });
        pageNumbers.addEventListener('click', (event) => {
            const button = event.target.closest('[data-page-index]');
            if (!button) return;
            const targetPage = Number(button.dataset.pageIndex);
            if (!Number.isNaN(targetPage) && targetPage !== currentPage) {
                currentPage = targetPage;
                renderOrdersPage();
            }
        });
        pageNext.addEventListener('click', () => {
            if (currentPage < lastTotalPages - 1) {
                currentPage += 1;
                renderOrdersPage();
            }
        });
        pageLast.addEventListener('click', () => {
            if (lastTotalPages > 0 && currentPage < lastTotalPages - 1) {
                currentPage = lastTotalPages - 1;
                renderOrdersPage();
            }
        });

        bindTextDatePicker(dateFromEl, dateFromPickerBtn);
        bindTextDatePicker(dateToEl, dateToPickerBtn);

        loadOrders().catch(err => toast(err.message, 'danger'));
    }

    function initOrderFormPage() {
        const page = document.getElementById('orderFormPage');
        if (!page) return;

        const rawOrderId = page.dataset.orderId;
        const urlOrderIdRaw = new URLSearchParams(window.location.search).get('id');
        const parsedOrderId = rawOrderId ? Number(rawOrderId) : null;
        const parsedOrderIdFromUrl = urlOrderIdRaw ? Number(urlOrderIdRaw) : null;
        const orderIdFromPage = Number.isFinite(parsedOrderId)
            ? parsedOrderId
            : (Number.isFinite(parsedOrderIdFromUrl) ? parsedOrderIdFromUrl : null);

        const form = document.getElementById('orderPageForm');
        const orderIdEl = document.getElementById('orderId');
        const orderNumberEl = document.getElementById('orderNumber');
        const orderNumberHintEl = document.getElementById('orderNumberHint');
        const orderNumberFeedbackEl = document.getElementById('orderNumberFeedback');
        const orderDateEl = document.getElementById('orderDate');
        const orderDatePicker = document.getElementById('orderDatePicker');
        const orderTypeEl = document.getElementById('orderType');
        const studentsListEl = document.getElementById('studentsList');
        const saveBtn = document.getElementById('saveOrderPageBtn');
        const printOrderBtn = document.getElementById('printOrderBtn');
        const executeOrderBtn = document.getElementById('executeOrderBtn');
        const signOrderBtn = document.getElementById('signOrderBtn');
        const selectedStudentsCountEl = document.getElementById('selectedStudentsCount');
        const selectedStudentsPreviewEl = document.getElementById('selectedStudentsPreview');
        const orderFormTitleEl = document.getElementById('orderFormTitle');
        const openStudentSelectorBtn = document.getElementById('openStudentSelector');
        const studentDetailsContainerEl = document.getElementById('orderStudentDetails');

        const selectorFacultyEl = document.getElementById('orderStudentFaculty');
        const selectorDirectionEl = document.getElementById('orderStudentDirection');
        const selectorGroupEl = document.getElementById('orderStudentGroup');
        const selectorStatusEl = document.getElementById('orderStudentStatus');
        const selectorEducationLevelEl = document.getElementById('orderStudentEducationLevel');
        const selectorCourseEl = document.getElementById('orderStudentCourse');
        const selectorEducationFormEl = document.getElementById('orderStudentEducationForm');
        const selectorAcceleratedEl = document.getElementById('orderStudentAccelerated');
        const selectorSearchEl = document.getElementById('orderStudentSearch');
        const selectorSearchBtn = document.getElementById('orderStudentSearchBtn');
        const selectorResetFiltersBtn = document.getElementById('orderStudentResetFilters');
        const selectorTableBody = document.getElementById('orderStudentTableBody');
        const selectorHintEl = document.getElementById('orderStudentModalHint');
        const selectorPagePrevEl = document.getElementById('orderStudentPagePrev');
        const selectorPageNextEl = document.getElementById('orderStudentPageNext');
        const selectorPaginationInfoEl = document.getElementById('orderStudentPaginationInfo');
        const selectorModalEl = document.getElementById('orderStudentsModal');
        const curriculumDiffModalEl = document.getElementById('curriculumDiffModal');
        const curriculumDiffTitleEl = document.getElementById('curriculumDiffTitle');
        const curriculumDiffMetaEl = document.getElementById('curriculumDiffMeta');
        const curriculumDiffToggleRowsBtn = document.getElementById('curriculumDiffToggleRows');
        const curriculumDiffResetBtn = document.getElementById('curriculumDiffReset');
        const curriculumDiffToggleDebtBtn = document.getElementById('curriculumDiffToggleDebt');
        const curriculumDiffDebtPanelEl = document.getElementById('curriculumDiffDebtPanel');
        const curriculumDiffDebtTableEl = document.getElementById('curriculumDiffDebtTable');
        const curriculumDiffDebtCountEl = document.getElementById('curriculumDiffDebtCount');
        const curriculumDiffCourseTabsEl = document.getElementById('curriculumDiffCourseTabs');
        const curriculumDiffSemesterTabsEl = document.getElementById('curriculumDiffSemesterTabs');
        const curriculumDiffTargetLabelEl = document.getElementById('curriculumDiffTargetLabel');
        const curriculumDiffSourceLabelEl = document.getElementById('curriculumDiffSourceLabel');
        const curriculumDiffTargetTableEl = document.getElementById('curriculumDiffTargetTable');
        const curriculumDiffSourceTableEl = document.getElementById('curriculumDiffSourceTable');
        const curriculumDiffModalInstance = curriculumDiffModalEl ? new bootstrap.Modal(curriculumDiffModalEl) : null;

        const months = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ];
        const ORDER_STUDENT_FORM_TO_GROUP_FORM = {
            'Очная': 'FULL_TIME',
            'Очно-заочная': 'PART_TIME',
            'Заочная': 'DISTANCE'
        };
        const ORDER_GROUP_FORM_TO_STUDENT_FORM = {
            FULL_TIME: 'Очная',
            PART_TIME: 'Очно-заочная',
            DISTANCE: 'Заочная'
        };

        const selectedStudents = new Map();
        const studentDetails = new Map();
        const groupsByDirection = new Map();
        const directionById = new Map();
        let faculties = [];
        let allDirections = [];
        let allGroups = [];
        let allCurriculums = [];
        let selectorDirections = [];
        let selectorGroups = [];
        let currentCandidates = [];
        let selectorCurrentPage = 0;
        let selectorLastTotalPages = 1;
        const selectorPageSize = 20;
        const curriculumDiffState = {
            studentId: null,
            sourceRows: [],
            targetRows: [],
            sourceDirectionLabel: '',
            targetDirectionLabel: '',
            sourceVariantText: '',
            targetVariantText: '',
            fromCourse: null,
            sourcePlanYear: null,
            targetPlanYear: null,
            selectedCourse: null,
            selectedSemester: 'all',
            showOnlyDifference: false,
            showDebtSummary: false,
            debtSemesterLimit: 0
        };

        const executableOrderTypes = new Set([
            'TRANSFER_NEXT_COURSE',
            'TRANSFER_DIRECTION',
            'ACADEMIC_LEAVE',
            'EXPULSION',
            'ENROLLMENT'
        ]);
        const orderTypeNumberCodeMap = {
            ACADEMIC_LEAVE: 'А',
            ENROLLMENT: 'З',
            EXPULSION: 'О',
            TRANSFER_DIRECTION: 'П',
            TRANSFER_NEXT_COURSE: 'К'
        };
        const orderNumberPattern = /^(\d{4})-([А-ЯЁ])-([0-9]{3})$/u;
        const orderNumberDefaultHint = 'Формат: ГГГГ-БУКВА-XXX. Год берётся из даты приказа.';

        const isExecutableOrderType = (type) => executableOrderTypes.has(String(type || ''));
        const setStudentEditingLocked = (locked) => {
            const isLocked = Boolean(locked);
            if (openStudentSelectorBtn) {
                openStudentSelectorBtn.disabled = isLocked;
            }
            if (studentDetailsContainerEl) {
                studentDetailsContainerEl.querySelectorAll('.order-student-detail-input').forEach((control) => {
                    control.disabled = isLocked;
                });
            }
        };

        const updateExecuteButtonState = (order, options = {}) => {
            if (!executeOrderBtn) {
                return;
            }
            const assignId = options.assignId !== false;
            const hasId = assignId && Number.isFinite(Number(order?.id));
            const executableType = isExecutableOrderType(order?.type);
            const executed = Boolean(order?.executed);
            const signed = Boolean(order?.signed);
            const shouldShow = hasId && executableType;
            setStudentEditingLocked(hasId && signed);

            executeOrderBtn.classList.toggle('d-none', !shouldShow);
            if (signOrderBtn) {
                signOrderBtn.classList.toggle('d-none', !(hasId && executed && !signed));
            }
            if (!shouldShow) {
                executeOrderBtn.disabled = true;
                executeOrderBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Осуществить';
                executeOrderBtn.title = '';
                if (signOrderBtn) {
                    signOrderBtn.disabled = true;
                }
                saveBtn.disabled = false;
                return;
            }

            if (signed) {
                executeOrderBtn.disabled = true;
                executeOrderBtn.innerHTML = '<i class="bi bi-check2-all me-1"></i>Подписан';
                executeOrderBtn.title = 'Приказ подписан и заблокирован';
                if (signOrderBtn) {
                    signOrderBtn.disabled = true;
                }
                saveBtn.disabled = true;
            } else if (executed) {
                executeOrderBtn.disabled = true;
                executeOrderBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Осуществлён';
                executeOrderBtn.title = 'Приказ уже осуществлён';
                if (signOrderBtn) {
                    signOrderBtn.disabled = false;
                }
                saveBtn.disabled = true;
            } else {
                executeOrderBtn.disabled = false;
                executeOrderBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Осуществить';
                executeOrderBtn.title = '';
                if (signOrderBtn) {
                    signOrderBtn.disabled = true;
                }
                saveBtn.disabled = false;
            }
        };

        const parseNumericInput = (value) => {
            if (value === undefined || value === null || value === '') return null;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        };
        const formatTuitionAmount = (value) => formatMoneyInput(value, {emptyAsBlank: false});
        const getGroupFormByStudentForm = (studentEducationForm) =>
            ORDER_STUDENT_FORM_TO_GROUP_FORM[studentEducationForm] || '';
        const getStudentFormByGroupForm = (groupEducationForm) =>
            ORDER_GROUP_FORM_TO_STUDENT_FORM[groupEducationForm] || 'Очная';
        const orderDetailNumericFields = new Set([
            'fromCourse',
            'toCourse',
            'fromDirectionId',
            'toDirectionId',
            'fromGroupId',
            'toGroupId',
            'facultyId'
        ]);
        const orderDetailDateFields = new Set([
            'periodStart',
            'periodEnd',
            'studyStartDate',
            'studyEndDate'
        ]);
        const decisionDateOrderTypes = new Set([
            'TRANSFER_NEXT_COURSE',
            'TRANSFER_DIRECTION',
            'ENROLLMENT'
        ]);
        const decisionDateValidationMessage = 'Дата решения комиссии/деканата не может быть позже даты приказа.';

        const normalizeOrderDetailDate = (value) => {
            const parsed = parseDateInputToIso(value);
            if (parsed === undefined) {
                return null;
            }
            return parsed || null;
        };

        const ensureOrderDetailInlineFeedback = (input) => {
            if (!input) return null;
            const container = input.closest('.col-md-4') || input.parentElement;
            if (!container) return null;
            let feedback = container.querySelector('.order-detail-inline-feedback');
            if (!feedback) {
                feedback = document.createElement('div');
                feedback.className = 'invalid-feedback order-detail-inline-feedback';
                container.appendChild(feedback);
            }
            return feedback;
        };

        const clearDecisionDateInputError = (input) => {
            if (!input || input.dataset.decisionDateInvalid !== 'true') {
                return;
            }
            input.dataset.decisionDateInvalid = 'false';
            input.classList.remove('is-invalid');
            if (input.validationMessage === decisionDateValidationMessage) {
                input.setCustomValidity('');
            }
            const feedback = ensureOrderDetailInlineFeedback(input);
            if (feedback) {
                feedback.textContent = '';
                feedback.classList.remove('d-block');
            }
        };

        const setDecisionDateInputError = (input) => {
            if (!input) return;
            input.dataset.decisionDateInvalid = 'true';
            input.classList.add('is-invalid');
            input.setCustomValidity(decisionDateValidationMessage);
            const feedback = ensureOrderDetailInlineFeedback(input);
            if (feedback) {
                feedback.textContent = decisionDateValidationMessage;
                feedback.classList.add('d-block');
            }
        };

        const validateDecisionDateInput = (input) => {
            if (!input || !decisionDateOrderTypes.has(orderTypeEl.value)) {
                clearDecisionDateInputError(input);
                return true;
            }
            const orderDateIso = getOrderDateIso();
            const decisionDateIso = normalizeOrderDetailDate(input.value);
            if (!orderDateIso || !decisionDateIso) {
                clearDecisionDateInputError(input);
                return true;
            }
            if (decisionDateIso > orderDateIso) {
                setDecisionDateInputError(input);
                return false;
            }
            clearDecisionDateInputError(input);
            return true;
        };

        const validateAllDecisionDateInputs = () => {
            if (!studentDetailsContainerEl) {
                return true;
            }
            const inputs = studentDetailsContainerEl.querySelectorAll('.order-student-detail-input[data-field="periodStart"]');
            let isValid = true;
            inputs.forEach((input) => {
                if (!validateDecisionDateInput(input)) {
                    isValid = false;
                }
            });
            return isValid;
        };

        const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

        const escapeHtml = (value) => {
            const text = String(safeValue(value));
            return text
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#39;');
        };

        const extractSubgroup = (groupCode) => {
            const value = String(groupCode || '').trim();
            if (!value) return null;
            const dashIndex = value.lastIndexOf('-');
            if (dashIndex < 0 || dashIndex >= value.length - 1) return null;
            const suffix = value.slice(dashIndex + 1);
            if (suffix.length < 2) return null;
            const last = suffix[suffix.length - 1];
            return /\d/.test(last) ? Number(last) : null;
        };

        const getOrderDateIso = () => {
            const parsed = parseDateInputToIso(orderDateEl.value);
            return parsed || null;
        };

        const getOrderTypeCode = (type = orderTypeEl.value) => orderTypeNumberCodeMap[String(type || '')] || '';

        const getOrderNumberExample = () => {
            const orderDateIso = getOrderDateIso();
            const year = orderDateIso ? orderDateIso.slice(0, 4) : '2026';
            const code = getOrderTypeCode() || 'К';
            return `${year}-${code}-001`;
        };

        const setOrderNumberHint = (message, isWarning = false) => {
            if (!orderNumberHintEl) return;
            orderNumberHintEl.textContent = message || orderNumberDefaultHint;
            orderNumberHintEl.classList.toggle('text-danger', Boolean(isWarning));
            orderNumberHintEl.classList.toggle('text-muted', !isWarning);
        };

        const setOrderNumberPlaceholder = () => {
            orderNumberEl.placeholder = getOrderNumberExample();
        };

        const extractOrderNumberSequence = (value) => {
            const raw = String(value || '').trim().toUpperCase();
            if (!raw) return '';
            const parts = raw.split('-');
            if (parts.length >= 3) {
                return String(parts[parts.length - 1] || '').replace(/\D/g, '').slice(0, 3);
            }
            return raw.replace(/\D/g, '').slice(0, 3);
        };

        const applyOrderDateMask = () => {
            const digits = String(orderDateEl.value || '').replace(/\D/g, '').slice(0, 8);
            if (!digits) {
                orderDateEl.value = '';
                return;
            }
            if (digits.length <= 2) {
                orderDateEl.value = digits;
                return;
            }
            if (digits.length <= 4) {
                orderDateEl.value = `${digits.slice(0, 2)}.${digits.slice(2)}`;
                return;
            }
            orderDateEl.value = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
        };

        const validateOrderDateInput = () => {
            const value = String(orderDateEl.value || '').trim();
            if (!value) {
                orderDateEl.setCustomValidity('Укажите дату приказа');
                return false;
            }
            if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
                orderDateEl.setCustomValidity('Дата должна быть в формате дд.мм.гггг');
                return false;
            }
            const parsed = parseDateInputToIso(value);
            if (!parsed) {
                orderDateEl.setCustomValidity('Укажите корректную дату приказа');
                return false;
            }
            orderDateEl.setCustomValidity('');
            return true;
        };

        const syncOrderNumberWithOrderContext = (options = {}) => {
            const clearSequenceOnConflict = options.clearSequenceOnConflict === true;
            const showConflictHint = options.showConflictHint !== false;
            const typeCode = getOrderTypeCode();
            const dateIso = getOrderDateIso();
            const rawValue = String(orderNumberEl.value || '').trim().toUpperCase().replace(/[^0-9А-ЯЁ-]/g, '');
            setOrderNumberPlaceholder();

            if (!dateIso || !typeCode) {
                orderNumberEl.value = rawValue;
                setOrderNumberHint(orderNumberDefaultHint, false);
                return;
            }

            const expectedYear = dateIso.slice(0, 4);
            const expectedPrefix = `${expectedYear}-${typeCode}-`;
            const compactMatch = rawValue.match(/^(\d{4})-([А-ЯЁ])-?([0-9]{0,3})$/u);

            let sequence = '';
            let conflictHint = '';

            if (compactMatch) {
                const inputYear = compactMatch[1];
                const inputCode = compactMatch[2];
                const inputSequence = String(compactMatch[3] || '').replace(/\D/g, '').slice(0, 3);
                const yearMismatch = inputYear !== expectedYear;
                const codeMismatch = inputCode !== typeCode;
                if (yearMismatch || codeMismatch) {
                    sequence = clearSequenceOnConflict ? '' : inputSequence;
                    if (showConflictHint) {
                        if (yearMismatch && codeMismatch) {
                            conflictHint = 'Год и тип в номере не совпадали с датой и видом приказа. Номер пересобран автоматически.';
                        } else if (yearMismatch) {
                            conflictHint = 'Год в номере должен совпадать с датой приказа. Номер пересобран автоматически.';
                        } else {
                            conflictHint = 'Буква в номере должна соответствовать типу приказа. Номер пересобран автоматически.';
                        }
                    }
                } else {
                    sequence = inputSequence;
                }
            } else {
                sequence = clearSequenceOnConflict ? '' : extractOrderNumberSequence(rawValue);
                if (rawValue && showConflictHint) {
                    conflictHint = 'Номер приведён к формату выбранного типа приказа.';
                }
            }

            orderNumberEl.value = `${expectedPrefix}${sequence}`;
            setOrderNumberHint(conflictHint || orderNumberDefaultHint, Boolean(conflictHint));
        };

        const validateOrderNumberInput = () => {
            const value = String(orderNumberEl.value || '').trim().toUpperCase();
            const dateIso = getOrderDateIso();
            const typeCode = getOrderTypeCode();

            if (!value) {
                orderNumberEl.setCustomValidity('Укажите номер приказа');
                if (orderNumberFeedbackEl) orderNumberFeedbackEl.textContent = 'Укажите номер приказа';
                return false;
            }

            const match = value.match(orderNumberPattern);
            if (!match) {
                const message = `Номер приказа должен быть в формате ${getOrderNumberExample()}`;
                orderNumberEl.setCustomValidity(message);
                if (orderNumberFeedbackEl) orderNumberFeedbackEl.textContent = message;
                return false;
            }

            if (dateIso) {
                const expectedYear = dateIso.slice(0, 4);
                if (match[1] !== expectedYear) {
                    const message = 'Год в номере приказа должен совпадать с годом даты приказа';
                    orderNumberEl.setCustomValidity(message);
                    if (orderNumberFeedbackEl) orderNumberFeedbackEl.textContent = message;
                    return false;
                }
            }

            if (typeCode && match[2] !== typeCode) {
                const message = `Для выбранного типа приказа используйте номер формата ${getOrderNumberExample()}`;
                orderNumberEl.setCustomValidity(message);
                if (orderNumberFeedbackEl) orderNumberFeedbackEl.textContent = message;
                return false;
            }

            orderNumberEl.value = value;
            orderNumberEl.setCustomValidity('');
            if (orderNumberFeedbackEl) orderNumberFeedbackEl.textContent = 'Укажите корректный номер приказа';
            return true;
        };

        const formatOrderDateText = (isoDate) => {
            const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!match) return '';
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            return `${day} ${months[month - 1]} ${year}`;
        };

        const directionLabel = (direction) => {
            if (!direction) return '';
            if (!direction.code) return direction.name || '';
            if (!direction.name) return direction.code;
            return `${direction.code} "${direction.name}"`;
        };

        const getDirectionById = (id) => {
            if (!id) return null;
            return directionById.get(Number(id)) || null;
        };

        const getDirectionTuition = (directionId) => {
            const direction = getDirectionById(directionId);
            return direction ? formatMoneyInput(direction.annualTuition, {emptyAsBlank: true}) : '';
        };

        const getGroupsForDirectionCourse = (directionId, course) => {
            const list = groupsByDirection.get(Number(directionId)) || [];
            return list.filter(group => Number(group.course) === Number(course));
        };

        const getGroupByCode = (groupCode) => {
            const normalized = String(groupCode || '').trim();
            if (!normalized) return null;
            return allGroups.find(group => String(group.code || '').trim() === normalized) || null;
        };

        const groupEducationFormLabel = (value) => {
            if (value === 'FULL_TIME') return 'Очная';
            if (value === 'PART_TIME') return 'Очно-заочная';
            if (value === 'DISTANCE') return 'Заочная';
            return value || 'Не указана';
        };
        const groupEducationLevelLabel = (value) => {
            if (value === 'BACHELOR') return 'Бакалавр';
            if (value === 'SPECIALIST') return 'Специалитет';
            if (value === 'MASTER') return 'Магистратура';
            return value || 'Не указан';
        };
        const curriculumPlanYearLabel = (startYear) => {
            const year = Number(startYear) || 0;
            return year > 0 ? `${year}/${year + 1}` : '';
        };
        const resolveAcademicPeriodInfo = (isoDate) => {
            const normalized = normalizeOrderDetailDate(isoDate);
            if (!normalized) {
                return null;
            }
            const year = Number(normalized.slice(0, 4));
            const month = Number(normalized.slice(5, 7));
            if (!Number.isFinite(year) || !Number.isFinite(month)) {
                return null;
            }
            if (month >= 9 && month <= 12) {
                return {semesterType: 'odd', planYearStart: year};
            }
            if (month === 1) {
                return {semesterType: 'odd', planYearStart: year - 1};
            }
            if (month >= 2 && month <= 5) {
                return {semesterType: 'even', planYearStart: year - 1};
            }
            if (month >= 6 && month <= 8) {
                return {semesterType: 'odd', planYearStart: year};
            }
            return null;
        };
        const buildAcademicRestorePrediction = (detail, student) => {
            const fromCourse = parseNumericInput(detail?.fromCourse) || parseNumericInput(student?.course);
            const startInfo = resolveAcademicPeriodInfo(detail?.periodStart);
            const endInfo = resolveAcademicPeriodInfo(detail?.periodEnd);
            if (!fromCourse || !startInfo || !endInfo) {
                return null;
            }
            const restoreSemester = endInfo.semesterType === 'even'
                ? Number(fromCourse) * 2
                : Number(fromCourse) * 2 - 1;
            const restorePlanYearStart = Number(endInfo.planYearStart) || null;
            const sourcePlanYearStart = Number(startInfo.planYearStart) || null;
            const restorePlanYearText = curriculumPlanYearLabel(restorePlanYearStart);
            return {
                restoreCourse: Number(fromCourse),
                restoreSemester,
                restorePlanYearStart,
                sourcePlanYearStart,
                restoreTargetText: restorePlanYearText
                    ? `${fromCourse} курс, ${restoreSemester} семестр, ${restorePlanYearText} учебный год`
                    : `${fromCourse} курс, ${restoreSemester} семестр`,
                restorePlanText: restorePlanYearText ? `${restorePlanYearText} учебный год` : '',
                debtSemesterLimit: Math.max(0, restoreSemester - 1)
            };
        };

        const normalizeCurriculumDiscipline = (value) => String(value || '')
            .replace(/\s*\(\d{2}\.\d{2}\.\d{2}\)\s*$/u, '')
            .replace(/\s+/g, ' ')
            .trim();

        const curriculumAttestationLabel = (item) => {
            const base = safeValue(item?.attestation);
            if (!item?.courseWork) {
                return base;
            }
            return base ? `${base}, курсовая работа` : 'курсовая работа';
        };

        const curriculumRowSort = (left, right) => {
            const leftCourse = Number(left?.course) || 0;
            const rightCourse = Number(right?.course) || 0;
            if (leftCourse !== rightCourse) return leftCourse - rightCourse;
            const leftSemester = Number(left?.semester) || 0;
            const rightSemester = Number(right?.semester) || 0;
            if (leftSemester !== rightSemester) return leftSemester - rightSemester;
            return String(left?.discipline || '').localeCompare(String(right?.discipline || ''), 'ru-RU', {
                numeric: true,
                sensitivity: 'base'
            });
        };

        const curriculumDedupeKey = (item, includeCourse = false) => {
            const parts = [];
            if (includeCourse) {
                parts.push(Number(item?.course) || 0);
            }
            parts.push(
                Number(item?.semester) || 0,
                normalizeCurriculumDiscipline(item?.discipline).toLowerCase(),
                Number(item?.hours) || 0,
                String(item?.attestation || ''),
                Boolean(item?.courseWork) ? '1' : '0'
            );
            return parts.join('|');
        };

        const dedupeCurriculumRows = (rows, includeCourse = false) => {
            const map = new Map();
            (rows || []).forEach((row) => {
                const key = curriculumDedupeKey(row, includeCourse);
                if (!map.has(key)) {
                    map.set(key, row);
                }
            });
            return Array.from(map.values()).sort(curriculumRowSort);
        };

        const ensureCurriculumsLoaded = async () => {
            if (allCurriculums.length > 0) {
                return;
            }
            const raw = await api('/api/curriculums');
            const normalized = (raw || []).map((item) => ({
                ...item,
                course: Number(item.course) || 0,
                semester: Number(item.semester) || 0,
                hours: Number(item.hours) || 0,
                planYear: Number(item.planYear) || 0,
                discipline: normalizeCurriculumDiscipline(item.discipline),
                educationLevel: String(item.educationLevel || 'BACHELOR'),
                educationForm: String(item.educationForm || 'FULL_TIME'),
                accelerated: Boolean(item.accelerated)
            }));
            allCurriculums = normalized;
        };

        const resolveGroupForDiff = (student, detail, side) => {
            const isTarget = side === 'target';
            const fromGroupId = parseNumericInput(detail?.fromGroupId) || parseNumericInput(student?.groupId);
            const fromGroupCode = detail?.fromGroup || student?.groupCode || '';
            const toGroupId = parseNumericInput(detail?.toGroupId);
            const toGroupCode = detail?.toGroup || '';
            const candidateGroupId = isTarget ? toGroupId : fromGroupId;
            const candidateGroupCode = isTarget ? toGroupCode : fromGroupCode;
            const matchesTargetFilters = (group) => {
                if (!isTarget || !group) return true;
                if (detail?.transferGroupEducationForm
                    && String(group.educationForm || '') !== String(detail.transferGroupEducationForm)) {
                    return false;
                }
                if (detail?.transferGroupAccelerated === 'true' && !Boolean(group.accelerated)) {
                    return false;
                }
                if (detail?.transferGroupAccelerated === 'false' && Boolean(group.accelerated)) {
                    return false;
                }
                return true;
            };

            if (candidateGroupId) {
                const byId = allGroups.find((group) => Number(group.id) === Number(candidateGroupId));
                if (byId && matchesTargetFilters(byId)) return byId;
            }
            if (candidateGroupCode) {
                const byCode = getGroupByCode(candidateGroupCode);
                if (byCode && matchesTargetFilters(byCode)) return byCode;
            }

            if (isTarget) {
                const directionId = parseNumericInput(detail?.toDirectionId);
                const toCourse = parseNumericInput(detail?.toCourse);
                if (directionId && toCourse) {
                    let candidates = getGroupsForDirectionCourse(directionId, toCourse);
                    if (detail?.transferGroupEducationForm) {
                        candidates = candidates.filter(group =>
                            String(group.educationForm || '') === String(detail.transferGroupEducationForm)
                        );
                    }
                    if (detail?.transferGroupAccelerated === 'true') {
                        candidates = candidates.filter(group => Boolean(group.accelerated));
                    } else if (detail?.transferGroupAccelerated === 'false') {
                        candidates = candidates.filter(group => !Boolean(group.accelerated));
                    }
                    if (candidates.length > 0) {
                        return candidates[0];
                    }
                }
            }
            return null;
        };

        const groupVariant = (group, fallback = {}) => ({
            educationLevel: String(group?.educationLevel || fallback.educationLevel || 'BACHELOR'),
            educationForm: String(group?.educationForm || fallback.educationForm || 'FULL_TIME'),
            accelerated: group?.accelerated !== undefined
                ? Boolean(group.accelerated)
                : Boolean(fallback.accelerated)
        });

        const targetVariantFromDetail = (detail, sourceVariant, targetGroup) => {
            const baseVariant = targetGroup
                ? groupVariant(targetGroup, sourceVariant)
                : {
                    educationLevel: String(sourceVariant.educationLevel || 'BACHELOR'),
                    educationForm: String(sourceVariant.educationForm || 'FULL_TIME'),
                    accelerated: Boolean(sourceVariant.accelerated)
                };

            const transferAccelerated = detail?.transferGroupAccelerated;
            const accelerated = transferAccelerated === 'true'
                ? true
                : transferAccelerated === 'false'
                    ? false
                    : Boolean(baseVariant.accelerated);
            return {
                educationLevel: String(baseVariant.educationLevel || 'BACHELOR'),
                educationForm: String(detail?.transferGroupEducationForm || baseVariant.educationForm || 'FULL_TIME'),
                accelerated
            };
        };

        const formatVariantText = (variant) => {
            const level = groupEducationLevelLabel(variant.educationLevel);
            const form = groupEducationFormLabel(variant.educationForm);
            const accelerated = variant.accelerated ? ', ускоренная форма' : '';
            return `${level} • ${form}${accelerated}`;
        };

        const resolveEffectiveCurriculumPlanYear = (rows, requestedPlanYear = null) => {
            const years = Array.from(
                new Set((rows || [])
                    .map(item => Number(item.planYear) || 0)
                    .filter(year => Number.isFinite(year) && year > 0))
            ).sort((left, right) => left - right);
            if (!years.length) {
                return null;
            }
            const requested = parseNumericInput(requestedPlanYear);
            if (!requested) {
                return years[years.length - 1];
            }
            let effective = years[0];
            for (const year of years) {
                if (year <= requested) {
                    effective = year;
                } else {
                    break;
                }
            }
            return effective;
        };

        const selectCurriculumPlanRows = (directionId, variant, planYear = null) => {
            const resolvedDirectionId = parseNumericInput(directionId);
            if (!resolvedDirectionId) {
                return {rows: [], effectivePlanYear: null};
            }
            const byScope = allCurriculums.filter((item) =>
                Number(item.directionId) === Number(resolvedDirectionId)
                && String(item.educationLevel || '') === String(variant.educationLevel || '')
                && String(item.educationForm || '') === String(variant.educationForm || '')
                && Boolean(item.accelerated) === Boolean(variant.accelerated)
            );
            if (byScope.length === 0) {
                return {rows: [], effectivePlanYear: null};
            }
            const effectivePlanYear = resolveEffectiveCurriculumPlanYear(byScope, planYear);
            if (!effectivePlanYear) {
                return {rows: [], effectivePlanYear: null};
            }
            const rows = dedupeCurriculumRows(
                byScope.filter(item => Number(item.planYear) === Number(effectivePlanYear)),
                true
            );
            return {rows, effectivePlanYear};
        };

        const filterCurriculumRows = (directionId, variant, planYear = null) => {
            return selectCurriculumPlanRows(directionId, variant, planYear).rows;
        };

        const buildCurriculumPairs = (sourceRows, targetRows, options = {}) => {
            const selectedCourse = parseNumericInput(options.selectedCourse);
            const selectedSemester = String(options.selectedSemester || 'all');
            const showOnlyDifference = Boolean(options.showOnlyDifference);

            const sourceFiltered = (sourceRows || [])
                .filter(row => !selectedCourse || Number(row.course) === Number(selectedCourse))
                .filter(row => selectedSemester === 'all' || String(row.semester) === selectedSemester);
            const targetFiltered = (targetRows || [])
                .filter(row => !selectedCourse || Number(row.course) === Number(selectedCourse))
                .filter(row => selectedSemester === 'all' || String(row.semester) === selectedSemester);

            const sourceMap = new Map();
            sourceFiltered.forEach((row) => {
                sourceMap.set(curriculumDedupeKey(row, false), row);
            });
            const targetMap = new Map();
            targetFiltered.forEach((row) => {
                targetMap.set(curriculumDedupeKey(row, false), row);
            });

            const sortRows = (rows) => [...rows].sort(curriculumRowSort);

            const commonRows = sortRows(
                Array.from(sourceMap.keys())
                    .filter(key => targetMap.has(key))
                    .map(key => sourceMap.get(key))
                    .filter(Boolean)
            );
            const commonPairs = commonRows.map((row) => {
                const key = curriculumDedupeKey(row, false);
                return {
                    key,
                    left: targetMap.get(key) || null,
                    right: sourceMap.get(key) || null,
                    status: 'both',
                    course: Number(row?.course || 0),
                    semester: Number(row?.semester || 0),
                    discipline: normalizeCurriculumDiscipline(row?.discipline)
                };
            });

            const leftOnlyRows = sortRows(
                Array.from(targetMap.keys())
                    .filter(key => !sourceMap.has(key))
                    .map(key => targetMap.get(key))
                    .filter(Boolean)
            );
            const rightOnlyRows = sortRows(
                Array.from(sourceMap.keys())
                    .filter(key => !targetMap.has(key))
                    .map(key => sourceMap.get(key))
                    .filter(Boolean)
            );

            const diffPairs = [];
            const diffMax = Math.max(leftOnlyRows.length, rightOnlyRows.length);
            for (let i = 0; i < diffMax; i += 1) {
                const left = leftOnlyRows[i] || null;
                const right = rightOnlyRows[i] || null;
                diffPairs.push({
                    key: `${i}`,
                    left,
                    right,
                    status: left && right ? 'diff' : (left ? 'left-only' : 'right-only'),
                    course: Number(left?.course || right?.course || 0),
                    semester: Number(left?.semester || right?.semester || 0),
                    discipline: normalizeCurriculumDiscipline(left?.discipline || right?.discipline)
                });
            }

            const pairs = [...commonPairs, ...diffPairs];
            return showOnlyDifference
                ? pairs.filter(pair => pair.status !== 'both')
                : pairs;
        };

        const renderCurriculumDiffTableRows = (pairs, side) => {
            if (!pairs.length) {
                return '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
            }
            return pairs.map((pair) => {
                const item = side === 'left' ? pair.left : pair.right;
                const rowClass = !item
                    ? 'curriculum-row-empty'
                    : pair.status === 'both'
                        ? 'curriculum-row-match'
                        : 'curriculum-row-diff';
                if (!item) {
                    return `<tr class="${rowClass}">
                        <td colspan="4" class="text-center text-muted">-</td>
                    </tr>`;
                }
                return `<tr class="${rowClass}">
                    <td class="col-semester">${safeValue(item.semester)}</td>
                    <td class="col-discipline fw-semibold">${safeValue(item.discipline)}</td>
                    <td class="col-hours">${safeValue(item.hours)}</td>
                    <td class="col-attestation">${escapeHtml(curriculumAttestationLabel(item))}</td>
                </tr>`;
            }).join('');
        };

        const resetCurriculumDiffState = () => {
            curriculumDiffState.studentId = null;
            curriculumDiffState.sourceRows = [];
            curriculumDiffState.targetRows = [];
            curriculumDiffState.sourceDirectionLabel = '';
            curriculumDiffState.targetDirectionLabel = '';
            curriculumDiffState.sourceVariantText = '';
            curriculumDiffState.targetVariantText = '';
            curriculumDiffState.fromCourse = null;
            curriculumDiffState.sourcePlanYear = null;
            curriculumDiffState.targetPlanYear = null;
            curriculumDiffState.selectedCourse = null;
            curriculumDiffState.selectedSemester = 'all';
            curriculumDiffState.showOnlyDifference = false;
            curriculumDiffState.showDebtSummary = false;
            curriculumDiffState.debtSemesterLimit = 0;
        };

        const renderCurriculumDiffDebt = () => {
            if (!curriculumDiffDebtPanelEl || !curriculumDiffDebtTableEl || !curriculumDiffDebtCountEl) {
                return;
            }
            curriculumDiffDebtPanelEl.classList.toggle('d-none', !curriculumDiffState.showDebtSummary);
            if (!curriculumDiffState.showDebtSummary) {
                return;
            }

            const semesterLimit = Number(curriculumDiffState.debtSemesterLimit) || 0;
            if (semesterLimit <= 0) {
                curriculumDiffDebtCountEl.textContent = '0';
                curriculumDiffDebtTableEl.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">На пройденных курсах академической разницы нет.</td></tr>';
                return;
            }

            const sourcePast = curriculumDiffState.sourceRows.filter(row => Number(row.semester) <= semesterLimit);
            const targetPast = curriculumDiffState.targetRows.filter(row => Number(row.semester) <= semesterLimit);

            const sourceKeys = new Set(sourcePast.map(row => curriculumDedupeKey(row, true)));
            const debts = dedupeCurriculumRows(
                targetPast.filter(row => !sourceKeys.has(curriculumDedupeKey(row, true))),
                true
            ).sort(curriculumRowSort);

            curriculumDiffDebtCountEl.textContent = String(debts.length);
            curriculumDiffDebtTableEl.innerHTML = debts.length === 0
                ? '<tr><td colspan="5" class="text-center text-muted py-3">На пройденных курсах академической разницы нет.</td></tr>'
                : debts.map(item => `<tr>
                    <td class="col-course">${safeValue(item.course)}</td>
                    <td class="col-semester">${safeValue(item.semester)}</td>
                    <td class="col-discipline fw-semibold">${safeValue(item.discipline)}</td>
                    <td class="col-hours">${safeValue(item.hours)}</td>
                    <td class="col-attestation">${escapeHtml(curriculumAttestationLabel(item))}</td>
                </tr>`).join('');
        };

        const renderCurriculumDiffView = () => {
            if (!curriculumDiffCourseTabsEl || !curriculumDiffSemesterTabsEl
                || !curriculumDiffTargetTableEl || !curriculumDiffSourceTableEl) {
                return;
            }

            const courses = Array.from(new Set([
                ...curriculumDiffState.sourceRows.map(row => Number(row.course) || 0),
                ...curriculumDiffState.targetRows.map(row => Number(row.course) || 0)
            ].filter(value => value > 0))).sort((left, right) => left - right);

            if (!courses.includes(Number(curriculumDiffState.selectedCourse))) {
                const preferredCourse = Number(curriculumDiffState.fromCourse) || courses[0] || null;
                curriculumDiffState.selectedCourse = courses.includes(preferredCourse) ? preferredCourse : (courses[0] || null);
                curriculumDiffState.selectedSemester = 'all';
            }

            curriculumDiffCourseTabsEl.innerHTML = courses.length === 0
                ? '<div class="text-muted small">Курсы не найдены</div>'
                : courses.map(course => `
                    <button type="button"
                            class="nav-link ${Number(curriculumDiffState.selectedCourse) === Number(course) ? 'active' : ''}"
                            data-diff-course="${course}">
                        ${course} курс
                    </button>
                `).join('');

            if (!curriculumDiffState.selectedCourse) {
                curriculumDiffSemesterTabsEl.innerHTML = '';
                curriculumDiffTargetTableEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
                curriculumDiffSourceTableEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
                return;
            }

            const firstSemester = Number(curriculumDiffState.selectedCourse) * 2 - 1;
            const secondSemester = Number(curriculumDiffState.selectedCourse) * 2;
            const semesterTabs = [
                {id: 'all', label: 'Все'},
                {id: String(firstSemester), label: `${firstSemester} семестр`},
                {id: String(secondSemester), label: `${secondSemester} семестр`}
            ];
            if (!semesterTabs.some(tab => tab.id === curriculumDiffState.selectedSemester)) {
                curriculumDiffState.selectedSemester = 'all';
            }

            curriculumDiffSemesterTabsEl.innerHTML = semesterTabs.map(tab => `
                <button type="button"
                        class="nav-link ${curriculumDiffState.selectedSemester === tab.id ? 'active' : ''}"
                        data-diff-semester="${tab.id}">
                    ${tab.label}
                </button>
            `).join('');

            const pairs = buildCurriculumPairs(
                curriculumDiffState.sourceRows,
                curriculumDiffState.targetRows,
                {
                    selectedCourse: curriculumDiffState.selectedCourse,
                    selectedSemester: curriculumDiffState.selectedSemester,
                    showOnlyDifference: curriculumDiffState.showOnlyDifference
                }
            );

            curriculumDiffTargetTableEl.innerHTML = renderCurriculumDiffTableRows(pairs, 'left');
            curriculumDiffSourceTableEl.innerHTML = renderCurriculumDiffTableRows(pairs, 'right');

            if (curriculumDiffToggleRowsBtn) {
                curriculumDiffToggleRowsBtn.textContent = curriculumDiffState.showOnlyDifference
                    ? 'Показать все'
                    : 'Разница';
            }
        };

        const openCurriculumDiffForStudent = async (studentId) => {
            if (!curriculumDiffModalInstance) {
                return;
            }
            const student = selectedStudents.get(Number(studentId));
            if (!student) {
                toast('Не удалось найти выбранного студента.', 'danger');
                return;
            }
            const detail = ensureStudentDetail(student);
            const fromDirectionId = parseNumericInput(detail.fromDirectionId) || parseNumericInput(student.directionId);
            if (!fromDirectionId) {
                toast('Не удалось определить текущее направление студента.', 'danger');
                return;
            }

            await ensureCurriculumsLoaded();

            const sourceGroup = resolveGroupForDiff(student, detail, 'source');
            const sourceVariant = groupVariant(sourceGroup, {
                educationForm: getGroupFormByStudentForm(detail.educationForm || student.educationForm || 'Очная'),
                accelerated: false
            });
            const fromDirection = getDirectionById(fromDirectionId);

            if (orderTypeEl.value === 'ACADEMIC_LEAVE') {
                const prediction = buildAcademicRestorePrediction(detail, student);
                if (!prediction) {
                    toast('Укажите даты начала и окончания академа для расчёта восстановления.', 'warning');
                    return;
                }

                const sourcePlanYear = Number(prediction.sourcePlanYearStart) || 0;
                const targetPlanYear = Number(prediction.restorePlanYearStart) || 0;
                const sourceSelection = selectCurriculumPlanRows(fromDirectionId, sourceVariant, sourcePlanYear);
                const targetSelection = selectCurriculumPlanRows(fromDirectionId, sourceVariant, targetPlanYear);
                const sourceRows = sourceSelection.rows;
                const targetRows = targetSelection.rows;
                const sourceEffectivePlanYear = sourceSelection.effectivePlanYear || sourcePlanYear || null;
                const targetEffectivePlanYear = targetSelection.effectivePlanYear || targetPlanYear || null;
                const sourceDisplayPlanYear = sourcePlanYear || sourceEffectivePlanYear || null;
                const targetDisplayPlanYear = targetPlanYear || targetEffectivePlanYear || null;
                const sourceFallbackNote = sourceDisplayPlanYear && sourceEffectivePlanYear
                    && Number(sourceDisplayPlanYear) !== Number(sourceEffectivePlanYear)
                    ? ` (по редакции ${curriculumPlanYearLabel(sourceEffectivePlanYear)} года)`
                    : '';
                const targetFallbackNote = targetDisplayPlanYear && targetEffectivePlanYear
                    && Number(targetDisplayPlanYear) !== Number(targetEffectivePlanYear)
                    ? ` (по редакции ${curriculumPlanYearLabel(targetEffectivePlanYear)} года)`
                    : '';
                if (sourceRows.length === 0 && targetRows.length === 0) {
                    toast('Для выбранных параметров учебные планы не найдены.', 'warning');
                    return;
                }

                curriculumDiffState.studentId = Number(studentId);
                curriculumDiffState.sourceRows = sourceRows;
                curriculumDiffState.targetRows = targetRows;
                curriculumDiffState.sourceDirectionLabel = `${directionLabel(fromDirection) || safeValue(detail.fromDirection)} • ${curriculumPlanYearLabel(sourceDisplayPlanYear) || '—'} год${sourceFallbackNote}`;
                curriculumDiffState.targetDirectionLabel = `${directionLabel(fromDirection) || safeValue(detail.fromDirection)} • ${curriculumPlanYearLabel(targetDisplayPlanYear) || '—'} год${targetFallbackNote}`;
                curriculumDiffState.sourceVariantText = formatVariantText(sourceVariant);
                curriculumDiffState.targetVariantText = formatVariantText(sourceVariant);
                curriculumDiffState.fromCourse = prediction.restoreCourse;
                curriculumDiffState.sourcePlanYear = sourceDisplayPlanYear;
                curriculumDiffState.targetPlanYear = targetDisplayPlanYear;
                curriculumDiffState.selectedCourse = prediction.restoreCourse;
                curriculumDiffState.selectedSemester = String(prediction.restoreSemester);
                curriculumDiffState.showOnlyDifference = false;
                curriculumDiffState.showDebtSummary = false;
                curriculumDiffState.debtSemesterLimit = prediction.debtSemesterLimit;

                if (curriculumDiffTitleEl) {
                    curriculumDiffTitleEl.textContent = `Разница учебных планов после академа — ${student.fullName}`;
                }
                if (curriculumDiffMetaEl) {
                    curriculumDiffMetaEl.textContent = `${curriculumDiffState.sourceVariantText}. Восстановление: ${prediction.restoreTargetText}.`;
                }
                if (curriculumDiffTargetLabelEl) {
                    curriculumDiffTargetLabelEl.textContent = `${curriculumDiffState.targetDirectionLabel || 'Не указано'} • ${curriculumDiffState.targetVariantText || '—'}`;
                }
                if (curriculumDiffSourceLabelEl) {
                    curriculumDiffSourceLabelEl.textContent = `${curriculumDiffState.sourceDirectionLabel || 'Не указано'} • ${curriculumDiffState.sourceVariantText || '—'}`;
                }

                renderCurriculumDiffView();
                curriculumDiffModalInstance.show();
                return;
            }

            const toDirectionId = parseNumericInput(detail.toDirectionId);
            if (!toDirectionId) {
                toast('Сначала выберите направление перевода.', 'warning');
                return;
            }

            const targetGroup = resolveGroupForDiff(student, detail, 'target');
            const targetVariant = targetVariantFromDetail(detail, sourceVariant, targetGroup);
            const sourceRows = filterCurriculumRows(fromDirectionId, sourceVariant);
            const targetRows = filterCurriculumRows(toDirectionId, targetVariant);
            if (sourceRows.length === 0 && targetRows.length === 0) {
                toast('Для выбранных параметров учебные планы не найдены.', 'warning');
                return;
            }

            const toDirection = getDirectionById(toDirectionId);
            const fromCourse = parseNumericInput(detail.fromCourse) || parseNumericInput(student.course) || null;

            curriculumDiffState.studentId = Number(studentId);
            curriculumDiffState.sourceRows = sourceRows;
            curriculumDiffState.targetRows = targetRows;
            curriculumDiffState.sourceDirectionLabel = fromDirection
                ? directionLabel(fromDirection)
                : safeValue(detail.fromDirection);
            curriculumDiffState.targetDirectionLabel = toDirection
                ? directionLabel(toDirection)
                : safeValue(detail.toDirection);
            curriculumDiffState.sourceVariantText = formatVariantText(sourceVariant);
            curriculumDiffState.targetVariantText = formatVariantText(targetVariant);
            curriculumDiffState.fromCourse = fromCourse;
            curriculumDiffState.sourcePlanYear = null;
            curriculumDiffState.targetPlanYear = null;
            curriculumDiffState.selectedCourse = fromCourse;
            curriculumDiffState.selectedSemester = 'all';
            curriculumDiffState.showOnlyDifference = false;
            curriculumDiffState.showDebtSummary = false;
            curriculumDiffState.debtSemesterLimit = Math.max(0, ((Number(fromCourse) || 0) - 1) * 2);

            if (curriculumDiffTitleEl) {
                curriculumDiffTitleEl.textContent = `Разница учебных планов — ${student.fullName}`;
            }
            if (curriculumDiffMetaEl) {
                curriculumDiffMetaEl.textContent = `${curriculumDiffState.sourceVariantText} → ${curriculumDiffState.targetVariantText}`;
            }
            if (curriculumDiffTargetLabelEl) {
                curriculumDiffTargetLabelEl.textContent = `${curriculumDiffState.targetDirectionLabel || 'Не указано'} • ${curriculumDiffState.targetVariantText || '—'}`;
            }
            if (curriculumDiffSourceLabelEl) {
                curriculumDiffSourceLabelEl.textContent = `${curriculumDiffState.sourceDirectionLabel || 'Не указано'} • ${curriculumDiffState.sourceVariantText || '—'}`;
            }

            renderCurriculumDiffView();
            curriculumDiffModalInstance.show();
        };

        const pickGroupBySubgroup = (groups, subgroup) => {
            if (!groups || groups.length === 0) return null;
            if (subgroup === null || subgroup === undefined) return groups[0];
            return groups.find(group => extractSubgroup(group.code) === subgroup) || groups[0];
        };

        const renderSelect = (selectEl, list, placeholder, labelField = 'name') => {
            if (!selectEl) return;
            const options = [`<option value="">${placeholder}</option>`]
                .concat((list || []).map(item => `<option value="${item.id}">${item.displayName || item[labelField] || item.code || item.name}</option>`));
            selectEl.innerHTML = options.join('');
        };

        const getEligibility = (student) => {
            const type = orderTypeEl.value;
            const status = student.status;

            if (type === 'ACADEMIC_LEAVE') {
                return status === 'ACTIVE'
                    ? {eligible: true, reason: 'Можно выбрать'}
                    : {eligible: false, reason: 'Нужен статус «Обучается»'};
            }
            if (type === 'ENROLLMENT') {
                return status === 'NEW'
                    ? {eligible: true, reason: 'Можно выбрать'}
                    : {eligible: false, reason: 'Нужен статус «Новый»'};
            }
            if (type === 'EXPULSION') {
                return status === 'ACTIVE' || status === 'ACADEMIC_LEAVE'
                    ? {eligible: true, reason: 'Можно выбрать'}
                    : {eligible: false, reason: 'Нужен статус «Обучается» или «Академ»'};
            }
            if (type === 'TRANSFER_DIRECTION' || type === 'TRANSFER_NEXT_COURSE') {
                return status === 'ACTIVE'
                    ? {eligible: true, reason: 'Можно выбрать'}
                    : {eligible: false, reason: 'Нужен статус «Обучается»'};
            }
            return {eligible: true, reason: 'Можно выбрать'};
        };

        const buildDefaultStudentDetail = (student) => {
            const orderDateIso = getOrderDateIso();
            const subgroup = extractSubgroup(student.groupCode);
            const currentGroup = allGroups.find(group => Number(group.id) === Number(student.groupId)) || null;
            const currentDirection = {
                id: student.directionId,
                code: student.directionCode,
                name: student.directionName
            };
            const detail = {
                studentId: student.id,
                studentName: student.fullName,
                fromCourse: student.course || null,
                toCourse: student.course || null,
                hasAcademicDebts: Boolean(student.hasAcademicDebts),
                facultyId: student.facultyId || null,
                facultyName: safeValue(student.facultyName),
                facultyShortName: safeValue(student.facultyShortName) || safeValue(student.facultyName),
                fromDirection: directionLabel(currentDirection),
                fromDirectionId: student.directionId || null,
                toDirection: '',
                toDirectionId: null,
                fromGroup: safeValue(student.groupCode),
                fromGroupId: student.groupId || null,
                toGroup: '',
                toGroupId: null,
                educationForm: safeValue(student.educationForm) || 'Очная',
                educationBase: safeValue(student.educationBase) || 'Бюджет',
                periodStart: null,
                periodEnd: null,
                basis: '',
                specialityName: student.directionName ? `"${student.directionName}"` : '',
                contractInfo: '',
                contractNumber: safeValue(student.studyContractNumber),
                studyStartDate: student.studyStartDate || null,
                studyEndDate: orderDateIso,
                tuitionAmount: safeValue(getDirectionTuition(student.directionId)),
                extraInfo: '',
                transferGroupEducationForm: currentGroup ? String(currentGroup.educationForm || '') : '',
                transferGroupAccelerated: currentGroup && currentGroup.accelerated ? 'true' : ''
            };

            if (detail.educationBase === 'Бюджет') {
                detail.tuitionAmount = '0,00';
            } else if (!detail.tuitionAmount) {
                detail.tuitionAmount = '0,00';
            }

            switch (orderTypeEl.value) {
                case 'TRANSFER_NEXT_COURSE': {
                    detail.toCourse = student.course ? student.course + 1 : null;
                    detail.toDirection = detail.fromDirection;
                    detail.toDirectionId = detail.fromDirectionId;
                    detail.periodStart = orderDateIso;
                    const nextGroups = getGroupsForDirectionCourse(student.directionId, detail.toCourse);
                    const nextGroup = pickGroupBySubgroup(nextGroups, subgroup);
                    if (nextGroup) {
                        detail.toGroup = nextGroup.code;
                        detail.toGroupId = nextGroup.id;
                    }
                    break;
                }
                case 'TRANSFER_DIRECTION': {
                    detail.toCourse = student.course || null;
                    detail.periodStart = orderDateIso;
                    break;
                }
                case 'ACADEMIC_LEAVE': {
                    detail.periodStart = orderDateIso;
                    detail.periodEnd = null;
                    detail.basis = 'заявление студента с визой декана';
                    break;
                }
                case 'EXPULSION': {
                    detail.studyEndDate = orderDateIso;
                    detail.basis = 'заявление студента с визой декана';
                    break;
                }
                case 'ENROLLMENT': {
                    detail.toCourse = 1;
                    detail.periodStart = orderDateIso;
                    detail.toDirectionId = student.directionId || null;
                    detail.toDirection = safeValue(student.directionCode);
                    const firstCourseGroups = getGroupsForDirectionCourse(student.directionId, 1);
                    const targetGroup = pickGroupBySubgroup(firstCourseGroups, subgroup);
                    if (targetGroup) {
                        detail.toGroup = targetGroup.code;
                        detail.toGroupId = targetGroup.id;
                    }
                    break;
                }
                default:
                    break;
            }

            return detail;
        };

        const hydrateStudentDetail = (student, sourceDetail = {}) => {
            const detail = {...sourceDetail};

            if (!detail.studentId) {
                detail.studentId = student.id;
            }
            if (!detail.studentName) {
                detail.studentName = student.fullName;
            }
            if (detail.hasAcademicDebts === undefined || detail.hasAcademicDebts === null || detail.hasAcademicDebts === '') {
                detail.hasAcademicDebts = false;
            } else if (typeof detail.hasAcademicDebts === 'string') {
                detail.hasAcademicDebts = detail.hasAcademicDebts === 'true';
            } else {
                detail.hasAcademicDebts = Boolean(detail.hasAcademicDebts);
            }

            if (detail.fromCourse === null || detail.fromCourse === undefined || detail.fromCourse === '') {
                detail.fromCourse = student.course || null;
            }
            if (!detail.fromGroup) {
                detail.fromGroup = safeValue(student.groupCode);
            }
            if (!detail.fromGroupId) {
                detail.fromGroupId = student.groupId || null;
            }
            if (!detail.fromDirectionId) {
                detail.fromDirectionId = student.directionId || null;
            }
            if (!detail.fromDirection) {
                detail.fromDirection = directionLabel({
                    id: student.directionId,
                    code: student.directionCode,
                    name: student.directionName
                });
            }

            const fallbackDirectionId = parseNumericInput(
                detail.toDirectionId || detail.fromDirectionId || student.directionId || null
            );
            const fallbackDirection = getDirectionById(fallbackDirectionId);
            if ((detail.facultyId === null || detail.facultyId === undefined || detail.facultyId === '')
                && fallbackDirection && fallbackDirection.facultyId) {
                detail.facultyId = Number(fallbackDirection.facultyId);
            }
            if ((detail.facultyId === null || detail.facultyId === undefined || detail.facultyId === '')
                && student.facultyId) {
                detail.facultyId = Number(student.facultyId);
            }

            const resolvedFaculty = detail.facultyId
                ? faculties.find(faculty => Number(faculty.id) === Number(detail.facultyId))
                : null;
            if (resolvedFaculty) {
                if (!detail.facultyName) {
                    detail.facultyName = resolvedFaculty.name || '';
                }
                if (!detail.facultyShortName) {
                    detail.facultyShortName = resolvedFaculty.shortName || resolvedFaculty.name || '';
                }
            } else {
                if (!detail.facultyName) {
                    detail.facultyName = student.facultyName || '';
                }
                if (!detail.facultyShortName) {
                    detail.facultyShortName = student.facultyShortName || student.facultyName || '';
                }
            }

            if (detail.toDirectionId) {
                const toDirection = getDirectionById(detail.toDirectionId);
                if (toDirection) {
                    if (orderTypeEl.value === 'ENROLLMENT') {
                        if (!detail.toDirection) {
                            detail.toDirection = safeValue(toDirection.code);
                        }
                        if (!detail.specialityName) {
                            detail.specialityName = `"${safeValue(toDirection.name)}"`;
                        }
                    } else if (!detail.toDirection) {
                        detail.toDirection = directionLabel(toDirection);
                    }
                    if ((detail.facultyId === null || detail.facultyId === undefined || detail.facultyId === '')
                        && toDirection.facultyId) {
                        detail.facultyId = Number(toDirection.facultyId);
                    }
                }
            }

            if (detail.toGroupId && !detail.toGroup) {
                const groupById = allGroups.find(group => Number(group.id) === Number(detail.toGroupId));
                if (groupById) {
                    detail.toGroup = groupById.code;
                }
            }
            if (!detail.toGroupId && detail.toGroup) {
                const groupByCode = getGroupByCode(detail.toGroup);
                if (groupByCode) {
                    detail.toGroupId = groupByCode.id;
                }
            }

            if (orderTypeEl.value === 'ENROLLMENT') {
                if (!detail.toDirectionId) {
                    detail.toDirectionId = parseNumericInput(student.directionId);
                }
                const enrollmentDirection = getDirectionById(detail.toDirectionId);
                if (!detail.toDirection) {
                    detail.toDirection = enrollmentDirection
                        ? safeValue(enrollmentDirection.code)
                        : safeValue(student.directionCode);
                }
                if (!detail.specialityName) {
                    const directionName = enrollmentDirection
                        ? safeValue(enrollmentDirection.name)
                        : safeValue(student.directionName);
                    detail.specialityName = directionName ? `"${directionName}"` : '';
                }
            }

            if (!detail.educationForm) {
                detail.educationForm = safeValue(student.educationForm) || 'Очная';
            }
            if (!detail.educationBase) {
                detail.educationBase = safeValue(student.educationBase) || 'Бюджет';
            }

            if (!detail.contractNumber) {
                detail.contractNumber = safeValue(student.studyContractNumber);
            }
            if (!detail.studyStartDate) {
                detail.studyStartDate = student.studyStartDate || null;
            }

            if (!detail.tuitionAmount) {
                if (detail.educationBase === 'Бюджет') {
                    detail.tuitionAmount = '0,00';
                } else {
                    detail.tuitionAmount = safeValue(getDirectionTuition(detail.toDirectionId || detail.fromDirectionId)) || '0,00';
                }
            }
            detail.tuitionAmount = formatTuitionAmount(detail.tuitionAmount);

            return detail;
        };

        const ensureStudentDetail = (student) => {
            if (!studentDetails.has(student.id)) {
                studentDetails.set(student.id, buildDefaultStudentDetail(student));
            }
            const hydrated = hydrateStudentDetail(student, studentDetails.get(student.id));
            studentDetails.set(student.id, hydrated);
            return hydrated;
        };

        const inputField = (studentId, field, label, value, type = 'text', required = false, readOnly = false) => `
            <div class="col-md-4">
                <label class="form-label small">${label}${required ? ' *' : ''}</label>
                <input
                    type="${type}"
                    class="form-control form-control-sm order-student-detail-input"
                    data-student-id="${studentId}"
                    data-field="${field}"
                    ${required ? 'required' : ''}
                    ${readOnly ? 'readonly' : ''}
                    value="${escapeHtml(value)}">
            </div>
        `;

        const selectField = (studentId, field, label, options, currentValue, required = false) => `
            <div class="col-md-4">
                <label class="form-label small">${label}${required ? ' *' : ''}</label>
                <select
                    class="form-select form-select-sm order-student-detail-input"
                    data-student-id="${studentId}"
                    data-field="${field}"
                    ${required ? 'required' : ''}>
                    ${options.map(option => `
                        <option value="${escapeHtml(option.value)}" ${String(option.value) === String(currentValue) ? 'selected' : ''}>
                            ${escapeHtml(option.label)}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;

        const checkboxField = (studentId, field, label, checked = false) => `
            <div class="col-md-4 d-flex align-items-end">
                <div class="form-check mt-2">
                    <input
                        class="form-check-input order-student-detail-input"
                        type="checkbox"
                        data-student-id="${studentId}"
                        data-field="${field}"
                        ${checked ? 'checked' : ''}>
                    <label class="form-check-label small">${label}</label>
                </div>
            </div>
        `;
        const staticInfoField = (studentId, label, value, field = '') => `
            <div class="col-md-6">
                <label class="form-label small">${label}</label>
                <input type="text"
                       class="form-control form-control-sm order-student-static-info"
                       ${field ? `data-student-id="${studentId}" data-static-field="${field}"` : ''}
                       value="${escapeHtml(value)}"
                       readonly
                       tabindex="-1">
            </div>
        `;
        const actionButtonField = (studentId, label) => `
            <div class="col-12 d-flex justify-content-end">
                <button type="button"
                        class="btn btn-outline-dark btn-sm order-open-curriculum-diff"
                        data-student-id="${studentId}">
                    <i class="bi bi-diagram-3 me-1"></i>${label}
                </button>
            </div>
        `;

        const buildTypeFields = (student, detail) => {
            if (orderTypeEl.value === 'TRANSFER_NEXT_COURSE') {
                return [
                    inputField(student.id, 'fromCourse', 'Курс текущий', detail.fromCourse || '', 'number', false, true),
                    inputField(student.id, 'toCourse', 'Курс следующий', detail.toCourse || '', 'number', false, true),
                    inputField(student.id, 'facultyShortName', 'Факультет', detail.facultyShortName || '', 'text', false, true),
                    inputField(student.id, 'fromDirection', 'Направление', detail.fromDirection || '', 'text', false, true),
                    inputField(student.id, 'fromGroup', 'Группа текущая', detail.fromGroup || '', 'text', false, true),
                    inputField(student.id, 'toGroup', 'Группа перевода', detail.toGroup || '', 'text', false, true),
                    checkboxField(student.id, 'hasAcademicDebts', 'Есть академические задолженности', Boolean(detail.hasAcademicDebts)),
                    inputField(student.id, 'periodStart', 'Дата решения комиссии', detail.periodStart || '', 'date')
                ].join('');
            }

            if (orderTypeEl.value === 'TRANSFER_DIRECTION') {
                const currentDirection = getDirectionById(student.directionId);
                const studentFacultyId = parseNumericInput(student.facultyId ?? (currentDirection ? currentDirection.facultyId : null));
                const allowedDirections = allDirections.filter(direction =>
                    studentFacultyId === null || Number(direction.facultyId) === studentFacultyId
                );
                const hasSelectedAllowedDirection = allowedDirections.some(direction =>
                    Number(direction.id) === Number(detail.toDirectionId)
                );
                if (detail.toDirectionId && !hasSelectedAllowedDirection) {
                    detail.toDirectionId = null;
                    detail.toDirection = '';
                    detail.toGroup = '';
                    detail.toGroupId = null;
                }
                const directionOptions = [{value: '', label: 'Выберите направление'}]
                    .concat(allowedDirections.map(direction => ({
                        value: direction.id,
                        label: directionLabel(direction)
                    })));
                const targetGroupsRaw = getGroupsForDirectionCourse(detail.toDirectionId, detail.toCourse);
                const availableForms = Array.from(new Set(targetGroupsRaw.map(group => String(group.educationForm || '')).filter(Boolean)));
                const formOptions = [{value: '', label: 'Все формы'}]
                    .concat(availableForms.map(form => ({value: form, label: groupEducationFormLabel(form)})));
                if (detail.transferGroupEducationForm && !availableForms.includes(String(detail.transferGroupEducationForm))) {
                    detail.transferGroupEducationForm = '';
                }
                const acceleratedOptions = [
                    {value: '', label: 'Все группы'},
                    {value: 'true', label: 'Только ускоренные'},
                    {value: 'false', label: 'Только обычные'}
                ];
                const targetGroups = targetGroupsRaw
                    .filter(group => {
                        if (detail.transferGroupEducationForm
                            && String(group.educationForm || '') !== String(detail.transferGroupEducationForm)) {
                            return false;
                        }
                        if (detail.transferGroupAccelerated === 'true' && !Boolean(group.accelerated)) {
                            return false;
                        }
                        if (detail.transferGroupAccelerated === 'false' && Boolean(group.accelerated)) {
                            return false;
                        }
                        return true;
                    })
                    .map(group => ({value: group.code, label: group.code}));
                return [
                    inputField(student.id, 'fromCourse', 'Курс текущий', detail.fromCourse || '', 'number', false, true),
                    inputField(student.id, 'facultyShortName', 'Факультет', detail.facultyShortName || '', 'text', false, true),
                    selectField(student.id, 'toDirectionId', 'Направление перевода', directionOptions, detail.toDirectionId, true),
                    selectField(student.id, 'transferGroupEducationForm', 'Форма обучения (фильтр группы)', formOptions, detail.transferGroupEducationForm || ''),
                    selectField(student.id, 'transferGroupAccelerated', 'Ускоренная форма (фильтр группы)', acceleratedOptions, detail.transferGroupAccelerated || ''),
                    targetGroups.length
                        ? selectField(student.id, 'toGroup', 'Группа перевода', targetGroups, detail.toGroup, true)
                        : inputField(student.id, 'toGroup', 'Группа перевода', detail.toGroup || '', 'text', true),
                    actionButtonField(student.id, 'Показать разницу в учебных планах'),
                    inputField(student.id, 'periodStart', 'Дата решения комиссии', detail.periodStart || '', 'date')
                ].join('');
            }

            if (orderTypeEl.value === 'ACADEMIC_LEAVE') {
                const prediction = buildAcademicRestorePrediction(detail, student);
                return [
                    inputField(student.id, 'fromCourse', 'Курс текущий', detail.fromCourse || '', 'number', false, true),
                    inputField(student.id, 'facultyShortName', 'Факультет', detail.facultyShortName || '', 'text', false, true),
                    inputField(student.id, 'fromDirection', 'Направление текущее', detail.fromDirection || '', 'text', false, true),
                    inputField(student.id, 'fromGroup', 'Группа текущая', detail.fromGroup || '', 'text', false, true),
                    inputField(student.id, 'educationForm', 'Форма обучения', detail.educationForm || '', 'text', false, true),
                    inputField(student.id, 'educationBase', 'Основа обучения', detail.educationBase || '', 'text', false, true),
                    inputField(student.id, 'periodStart', 'Дата начала', detail.periodStart || '', 'date', true),
                    inputField(student.id, 'periodEnd', 'Дата окончания', detail.periodEnd || '', 'date', true),
                    staticInfoField(
                        student.id,
                        'Восстановление после академа',
                        prediction ? prediction.restoreTargetText : 'Укажите даты начала и окончания',
                        'academicRestoreTarget'
                    ),
                    staticInfoField(
                        student.id,
                        'Активный учебный план после восстановления',
                        prediction ? prediction.restorePlanText : 'Укажите даты начала и окончания',
                        'academicRestorePlan'
                    ),
                    actionButtonField(student.id, 'Показать разницу в учебных планах'),
                    inputField(student.id, 'basis', 'Основание студента', detail.basis || '', 'text', true)
                ].join('');
            }

            if (orderTypeEl.value === 'EXPULSION') {
                return [
                    inputField(student.id, 'fromCourse', 'Курс текущий', detail.fromCourse || '', 'number', false, true),
                    inputField(student.id, 'facultyShortName', 'Факультет', detail.facultyShortName || '', 'text', false, true),
                    inputField(student.id, 'fromDirection', 'Направление текущее', detail.fromDirection || '', 'text', false, true),
                    inputField(student.id, 'fromGroup', 'Группа текущая', detail.fromGroup || '', 'text', false, true),
                    inputField(student.id, 'contractNumber', 'Номер договора', detail.contractNumber || '', 'text', false, true),
                    inputField(student.id, 'studyStartDate', 'Дата начала обучения', detail.studyStartDate || '', 'date', false, true),
                    inputField(student.id, 'studyEndDate', 'Дата окончания обучения', detail.studyEndDate || '', 'date', true),
                    inputField(student.id, 'tuitionAmount', 'Размер оплаты', detail.tuitionAmount || '0,00', 'text'),
                    inputField(student.id, 'basis', 'Основание', detail.basis || '', 'text', true)
                ].join('');
            }

            if (orderTypeEl.value === 'ENROLLMENT') {
                const facultyOptions = [{value: '', label: 'Выберите факультет'}]
                    .concat(faculties.map(faculty => ({
                        value: faculty.id,
                        label: faculty.displayName || formatFacultyName(faculty.name)
                    })));
                const directionOptions = [{value: '', label: 'Выберите направление'}]
                    .concat(allDirections
                        .filter(direction => !detail.facultyId || Number(direction.facultyId) === Number(detail.facultyId))
                        .map(direction => ({
                            value: direction.id,
                            label: directionLabel(direction)
                        })));
                const selectedDirection = getDirectionById(detail.toDirectionId);
                if (selectedDirection && detail.facultyId && Number(selectedDirection.facultyId) !== Number(detail.facultyId)) {
                    detail.toDirectionId = null;
                    detail.toDirection = '';
                    detail.specialityName = '';
                    detail.toGroup = '';
                    detail.toGroupId = null;
                }
                const courseOptions = [{value: '', label: 'Выберите курс'}]
                    .concat(Array.from({length: 6}, (_, index) => ({
                        value: String(index + 1),
                        label: String(index + 1)
                    })));
                const educationFormOptions = [
                    {value: 'Очная', label: 'Очная'},
                    {value: 'Очно-заочная', label: 'Очно-заочная'},
                    {value: 'Заочная', label: 'Заочная'}
                ];
                const educationBaseOptions = [
                    {value: 'Бюджет', label: 'Бюджет'},
                    {value: 'Внебюджет', label: 'Внебюджет'}
                ];
                const groupFormFilter = getGroupFormByStudentForm(detail.educationForm || 'Очная');
                const targetGroups = getGroupsForDirectionCourse(detail.toDirectionId || student.directionId, detail.toCourse || 1)
                    .filter(group => !groupFormFilter || String(group.educationForm || '') === groupFormFilter)
                    .map(group => ({value: group.code, label: group.code}));
                const directionCode = detail.toDirection
                    || (selectedDirection ? safeValue(selectedDirection.code) : '')
                    || safeValue(student.directionCode);
                const speciality = detail.specialityName
                    || (selectedDirection ? `"${safeValue(selectedDirection.name)}"` : '')
                    || (student.directionName ? `"${safeValue(student.directionName)}"` : '');
                return [
                    selectField(student.id, 'facultyId', 'Факультет', facultyOptions, detail.facultyId, true),
                    selectField(student.id, 'toDirectionId', 'Направление', directionOptions, detail.toDirectionId, true),
                    selectField(student.id, 'toCourse', 'Курс', courseOptions, detail.toCourse || 1, true),
                    targetGroups.length
                        ? selectField(student.id, 'toGroup', 'Группа', targetGroups, detail.toGroup, true)
                        : inputField(student.id, 'toGroup', 'Группа', detail.toGroup || '', 'text', true),
                    selectField(student.id, 'educationForm', 'Форма обучения', educationFormOptions, detail.educationForm || 'Очная', true),
                    selectField(student.id, 'educationBase', 'Основа обучения', educationBaseOptions, detail.educationBase || 'Бюджет', true),
                    inputField(student.id, 'toDirection', 'Код направления', directionCode, 'text', false, true),
                    inputField(student.id, 'specialityName', 'Специальность', speciality, 'text', false, true),
                    inputField(student.id, 'tuitionAmount', 'Размер оплаты', detail.tuitionAmount || '0,00', 'text'),
                    inputField(student.id, 'periodStart', 'Дата решения комиссии', detail.periodStart || '', 'date')
                ].join('');
            }

            return '';
        };

        const renderStudentDetails = () => {
            const selectedList = Array.from(selectedStudents.values());
            if (selectedList.length === 0) {
                studentDetailsContainerEl.innerHTML = '<div class="text-muted small">Выберите студентов для заполнения персональных данных.</div>';
                return;
            }

            studentDetailsContainerEl.innerHTML = selectedList.map((student, index) => {
                const detail = ensureStudentDetail(student);
                return `
                    <section class="card border-0 shadow-soft">
                        <div class="card-body">
                            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                <h3 class="h6 mb-0">${index + 1}) ${escapeHtml(student.fullName)}</h3>
                                <span class="badge text-bg-light">${escapeHtml(getStudentStatusLabel(student.status))}</span>
                            </div>
                            <div class="row g-2">
                                ${buildTypeFields(student, detail)}
                            </div>
                        </div>
                    </section>
                `;
            }).join('');

            bindStrictDateInputs(studentDetailsContainerEl);
            studentDetailsContainerEl.querySelectorAll('.order-student-detail-input[data-field="tuitionAmount"]').forEach((input) => {
                if (input.dataset.moneyMaskBound === 'true') {
                    return;
                }
                input.dataset.moneyMaskBound = 'true';
                input.value = formatTuitionAmount(input.value);
                input.addEventListener('beforeinput', (event) => {
                    if (!event.data || !event.inputType || !event.inputType.startsWith('insert')) {
                        return;
                    }
                    if (!/[0-9.,]/.test(event.data)) {
                        event.preventDefault();
                    }
                });
                input.addEventListener('input', () => {
                    applyMoneyMaskWithCaret(input, {
                        emptyAsBlank: false,
                        formatter: formatMoneyInputForTyping
                    });
                });
                input.addEventListener('paste', (event) => {
                    event.preventDefault();
                    const pasted = event.clipboardData?.getData('text') || '';
                    input.value = pasted;
                    applyMoneyMaskWithCaret(input, {
                        emptyAsBlank: false,
                        formatter: formatMoneyInputForTyping
                    });
                });
                input.addEventListener('blur', () => {
                    input.value = formatTuitionAmount(input.value);
                });
            });

            studentDetailsContainerEl.querySelectorAll('.order-student-detail-input').forEach(input => {
                input.addEventListener('change', (event) => {
                    const target = event.currentTarget;
                    const studentId = Number(target.dataset.studentId);
                    const field = target.dataset.field;
                    const detail = studentDetails.get(studentId);
                    const student = selectedStudents.get(studentId);
                    if (!detail || !field || !student) return;

                    if (field === 'hasAcademicDebts') {
                        detail.hasAcademicDebts = Boolean(target.checked);
                    } else if (orderDetailNumericFields.has(field)) {
                        detail[field] = parseNumericInput(target.value);
                    } else if (orderDetailDateFields.has(field)) {
                        const rawDateValue = String(target.value || '').trim();
                        const parsedDateValue = parseDateInputToIso(rawDateValue);
                        if (parsedDateValue === undefined) {
                            return;
                        }
                        if (parsedDateValue === null && target === document.activeElement) {
                            return;
                        }
                        detail[field] = parsedDateValue || null;
                        target.value = detail[field] || '';
                    } else {
                        detail[field] = target.value;
                    }
                    if (field === 'periodStart') {
                        validateDecisionDateInput(target);
                    }
                    if (field === 'tuitionAmount') {
                        detail.tuitionAmount = formatTuitionAmount(detail.tuitionAmount);
                        target.value = detail.tuitionAmount;
                    }
                    if (orderTypeEl.value === 'ACADEMIC_LEAVE'
                        && (field === 'periodStart' || field === 'periodEnd')) {
                        const prediction = buildAcademicRestorePrediction(detail, student);
                        const restoreTargetInput = studentDetailsContainerEl.querySelector(
                            `.order-student-static-info[data-student-id="${studentId}"][data-static-field="academicRestoreTarget"]`
                        );
                        const restorePlanInput = studentDetailsContainerEl.querySelector(
                            `.order-student-static-info[data-student-id="${studentId}"][data-static-field="academicRestorePlan"]`
                        );
                        if (restoreTargetInput) {
                            restoreTargetInput.value = prediction
                                ? prediction.restoreTargetText
                                : 'Укажите даты начала и окончания';
                        }
                        if (restorePlanInput) {
                            restorePlanInput.value = prediction
                                ? prediction.restorePlanText
                                : 'Укажите даты начала и окончания';
                        }
                        return;
                    }

                    if (field === 'facultyId' && orderTypeEl.value === 'ENROLLMENT') {
                        const selectedFaculty = faculties.find(faculty => Number(faculty.id) === Number(detail.facultyId));
                        if (selectedFaculty) {
                            detail.facultyName = selectedFaculty.name || '';
                            detail.facultyShortName = selectedFaculty.shortName || selectedFaculty.name || '';
                        }
                        const selectedDirection = getDirectionById(detail.toDirectionId);
                        if (selectedDirection && Number(selectedDirection.facultyId) !== Number(detail.facultyId)) {
                            detail.toDirectionId = null;
                            detail.toDirection = '';
                            detail.specialityName = '';
                            detail.toGroup = '';
                            detail.toGroupId = null;
                        }
                        renderStudentDetails();
                        return;
                    }

                    if (field === 'toDirectionId') {
                        const direction = getDirectionById(detail.toDirectionId);
                        if (orderTypeEl.value === 'TRANSFER_DIRECTION') {
                            const currentDirection = getDirectionById(student.directionId);
                            const studentFacultyId = parseNumericInput(student.facultyId ?? (currentDirection ? currentDirection.facultyId : null));
                            const selectedDirectionFacultyId = parseNumericInput(direction ? direction.facultyId : null);
                            if (direction && studentFacultyId !== null && selectedDirectionFacultyId !== null
                                && studentFacultyId !== selectedDirectionFacultyId) {
                                toast('Можно выбрать только направление своего факультета.', 'danger');
                                detail.toDirectionId = null;
                                detail.toDirection = '';
                                detail.toGroup = '';
                                detail.toGroupId = null;
                                renderStudentDetails();
                                return;
                            }
                            detail.toDirection = direction ? directionLabel(direction) : '';
                        } else if (orderTypeEl.value === 'ENROLLMENT') {
                            detail.toDirection = direction ? safeValue(direction.code) : '';
                            detail.specialityName = direction ? `"${safeValue(direction.name)}"` : '';
                            if (direction) {
                                detail.facultyId = parseNumericInput(direction.facultyId);
                                const selectedFaculty = faculties.find(faculty => Number(faculty.id) === Number(direction.facultyId));
                                if (selectedFaculty) {
                                    detail.facultyName = selectedFaculty.name || '';
                                    detail.facultyShortName = selectedFaculty.shortName || selectedFaculty.name || '';
                                }
                            }
                        } else {
                            detail.toDirection = direction ? directionLabel(direction) : '';
                        }
                        if (direction) {
                            if (!detail.specialityName && orderTypeEl.value !== 'ENROLLMENT') {
                                detail.specialityName = `"${direction.name}"`;
                            }
                            if (detail.educationBase !== 'Бюджет') {
                                detail.tuitionAmount = formatTuitionAmount(safeValue(direction.annualTuition) || detail.tuitionAmount);
                            }
                        }
                        const subgroup = extractSubgroup(detail.fromGroup || student.groupCode);
                        let targetGroups = getGroupsForDirectionCourse(detail.toDirectionId, detail.toCourse || student.course);
                        if (orderTypeEl.value === 'TRANSFER_DIRECTION') {
                            if (detail.transferGroupEducationForm) {
                                targetGroups = targetGroups.filter(group => String(group.educationForm || '') === String(detail.transferGroupEducationForm));
                            }
                            if (detail.transferGroupAccelerated === 'true') {
                                targetGroups = targetGroups.filter(group => Boolean(group.accelerated));
                            }
                            if (detail.transferGroupAccelerated === 'false') {
                                targetGroups = targetGroups.filter(group => !Boolean(group.accelerated));
                            }
                        }
                        if (orderTypeEl.value === 'ENROLLMENT') {
                            const groupFormFilter = getGroupFormByStudentForm(detail.educationForm || 'Очная');
                            if (groupFormFilter) {
                                targetGroups = targetGroups.filter(group => String(group.educationForm || '') === groupFormFilter);
                            }
                        }
                        const targetGroup = pickGroupBySubgroup(targetGroups, subgroup);
                        detail.toGroup = targetGroup ? targetGroup.code : '';
                        detail.toGroupId = targetGroup ? targetGroup.id : null;
                        renderStudentDetails();
                        return;
                    }

                    if (field === 'toGroup') {
                        const selectedGroup = getGroupByCode(detail.toGroup);
                        if (selectedGroup) {
                            detail.toGroupId = selectedGroup.id;
                            if (orderTypeEl.value === 'TRANSFER_DIRECTION') {
                                detail.toDirectionId = parseNumericInput(selectedGroup.directionId);
                                const direction = getDirectionById(detail.toDirectionId);
                                detail.toDirection = direction ? directionLabel(direction) : detail.toDirection;
                            }
                            if (orderTypeEl.value === 'ENROLLMENT') {
                                detail.toCourse = parseNumericInput(selectedGroup.course) || detail.toCourse;
                                detail.toDirectionId = parseNumericInput(selectedGroup.directionId);
                                const direction = getDirectionById(detail.toDirectionId);
                                if (direction) {
                                    detail.toDirection = safeValue(direction.code);
                                    detail.specialityName = `"${safeValue(direction.name)}"`;
                                    detail.facultyId = parseNumericInput(direction.facultyId);
                                    const selectedFaculty = faculties.find(faculty => Number(faculty.id) === Number(direction.facultyId));
                                    if (selectedFaculty) {
                                        detail.facultyName = selectedFaculty.name || '';
                                        detail.facultyShortName = selectedFaculty.shortName || selectedFaculty.name || '';
                                    }
                                }
                                const mappedStudentForm = getStudentFormByGroupForm(String(selectedGroup.educationForm || ''));
                                if (mappedStudentForm) {
                                    detail.educationForm = mappedStudentForm;
                                }
                            }
                        }
                        renderStudentDetails();
                        return;
                    }

                    if (field === 'transferGroupEducationForm' || field === 'transferGroupAccelerated') {
                        const subgroup = extractSubgroup(detail.fromGroup || student.groupCode);
                        let targetGroups = getGroupsForDirectionCourse(detail.toDirectionId, detail.toCourse || student.course);
                        if (detail.transferGroupEducationForm) {
                            targetGroups = targetGroups.filter(group =>
                                String(group.educationForm || '') === String(detail.transferGroupEducationForm)
                            );
                        }
                        if (detail.transferGroupAccelerated === 'true') {
                            targetGroups = targetGroups.filter(group => Boolean(group.accelerated));
                        }
                        if (detail.transferGroupAccelerated === 'false') {
                            targetGroups = targetGroups.filter(group => !Boolean(group.accelerated));
                        }
                        const targetGroup = pickGroupBySubgroup(targetGroups, subgroup);
                        detail.toGroup = targetGroup ? targetGroup.code : '';
                        detail.toGroupId = targetGroup ? targetGroup.id : null;
                        renderStudentDetails();
                        return;
                    }

                    if (field === 'toCourse' && orderTypeEl.value === 'TRANSFER_NEXT_COURSE') {
                        const subgroup = extractSubgroup(detail.fromGroup || student.groupCode);
                        const targetGroups = getGroupsForDirectionCourse(detail.fromDirectionId, detail.toCourse);
                        const targetGroup = pickGroupBySubgroup(targetGroups, subgroup);
                        detail.toGroup = targetGroup ? targetGroup.code : detail.toGroup;
                        detail.toGroupId = targetGroup ? targetGroup.id : detail.toGroupId;
                        renderStudentDetails();
                        return;
                    }

                    if (field === 'toCourse' && (orderTypeEl.value === 'TRANSFER_DIRECTION' || orderTypeEl.value === 'ENROLLMENT')) {
                        const subgroup = extractSubgroup(detail.fromGroup || student.groupCode);
                        let targetGroups = getGroupsForDirectionCourse(detail.toDirectionId, detail.toCourse || student.course);
                        if (orderTypeEl.value === 'TRANSFER_DIRECTION') {
                            if (detail.transferGroupEducationForm) {
                                targetGroups = targetGroups.filter(group => String(group.educationForm || '') === String(detail.transferGroupEducationForm));
                            }
                            if (detail.transferGroupAccelerated === 'true') {
                                targetGroups = targetGroups.filter(group => Boolean(group.accelerated));
                            }
                            if (detail.transferGroupAccelerated === 'false') {
                                targetGroups = targetGroups.filter(group => !Boolean(group.accelerated));
                            }
                        }
                        if (orderTypeEl.value === 'ENROLLMENT') {
                            const groupFormFilter = getGroupFormByStudentForm(detail.educationForm || 'Очная');
                            if (groupFormFilter) {
                                targetGroups = targetGroups.filter(group => String(group.educationForm || '') === groupFormFilter);
                            }
                        }
                        const targetGroup = pickGroupBySubgroup(targetGroups, subgroup);
                        detail.toGroup = targetGroup ? targetGroup.code : '';
                        detail.toGroupId = targetGroup ? targetGroup.id : null;
                        renderStudentDetails();
                        return;
                    }

                    if (field === 'educationForm' && orderTypeEl.value === 'ENROLLMENT') {
                        const subgroup = extractSubgroup(detail.fromGroup || student.groupCode);
                        let targetGroups = getGroupsForDirectionCourse(detail.toDirectionId, detail.toCourse || 1);
                        const groupFormFilter = getGroupFormByStudentForm(detail.educationForm || 'Очная');
                        if (groupFormFilter) {
                            targetGroups = targetGroups.filter(group => String(group.educationForm || '') === groupFormFilter);
                        }
                        const targetGroup = pickGroupBySubgroup(targetGroups, subgroup);
                        detail.toGroup = targetGroup ? targetGroup.code : '';
                        detail.toGroupId = targetGroup ? targetGroup.id : null;
                        renderStudentDetails();
                        return;
                    }

                    if (field === 'educationBase') {
                        if (detail.educationBase === 'Бюджет') {
                            detail.tuitionAmount = '0,00';
                        } else if (!detail.tuitionAmount || isZeroMoney(detail.tuitionAmount)) {
                            const directionId = detail.toDirectionId || detail.fromDirectionId;
                            detail.tuitionAmount = getDirectionTuition(directionId) || '0,00';
                        }
                        renderStudentDetails();
                        return;
                    }
                });
            });
            studentDetailsContainerEl.querySelectorAll('.order-open-curriculum-diff').forEach((button) => {
                button.addEventListener('click', () => {
                    const studentId = Number(button.dataset.studentId);
                    openCurriculumDiffForStudent(studentId).catch(err => toast(err.message, 'danger'));
                });
            });
            validateAllDecisionDateInputs();
        };

        const syncStudentDetailsFromInputs = () => {
            if (!studentDetailsContainerEl) {
                return;
            }
            const inputs = studentDetailsContainerEl.querySelectorAll('.order-student-detail-input');
            inputs.forEach((input) => {
                const studentId = Number(input.dataset.studentId);
                const field = input.dataset.field;
                const detail = studentDetails.get(studentId);
                if (!detail || !field) {
                    return;
                }
                if (field === 'hasAcademicDebts') {
                    detail.hasAcademicDebts = Boolean(input.checked);
                } else if (orderDetailNumericFields.has(field)) {
                    detail[field] = parseNumericInput(input.value);
                } else if (orderDetailDateFields.has(field)) {
                    detail[field] = normalizeOrderDetailDate(input.value);
                    if (field === 'periodStart') {
                        validateDecisionDateInput(input);
                    }
                } else if (field === 'tuitionAmount') {
                    detail[field] = formatTuitionAmount(input.value);
                } else {
                    detail[field] = input.value;
                }
            });
        };

        const renderSelectedStudents = () => {
            const selectedList = Array.from(selectedStudents.values());
            const lines = selectedList.map((student, index) => `${index + 1}) ${student.fullName}`);

            selectedStudentsCountEl.textContent = selectedList.length;
            studentsListEl.value = lines.join('\n');
            studentsListEl.setCustomValidity(selectedList.length ? '' : 'Выберите хотя бы одного студента');

            if (selectedList.length === 0) {
                selectedStudentsPreviewEl.textContent = 'Студенты не выбраны.';
                renderStudentDetails();
                return;
            }

            const previewNames = selectedList.slice(0, 4).map(student => student.fullName).join(', ');
            const suffix = selectedList.length > 4 ? ` и ещё ${selectedList.length - 4}` : '';
            selectedStudentsPreviewEl.textContent = `${previewNames}${suffix}`;
            renderStudentDetails();
        };

        const resetSelectedDetailsByType = () => {
            selectedStudents.forEach((student, id) => {
                studentDetails.set(id, buildDefaultStudentDetail(student));
            });
            renderSelectedStudents();
        };

        const syncOrderDateToDetails = () => {
            const orderDateIso = getOrderDateIso();
            selectedStudents.forEach((student, id) => {
                const detail = studentDetails.get(id) || buildDefaultStudentDetail(student);
                if (orderTypeEl.value === 'ACADEMIC_LEAVE'
                    || orderTypeEl.value === 'TRANSFER_NEXT_COURSE'
                    || orderTypeEl.value === 'TRANSFER_DIRECTION'
                    || orderTypeEl.value === 'ENROLLMENT') {
                    if (!detail.periodStart) {
                        detail.periodStart = orderDateIso;
                    }
                }
                if (orderTypeEl.value === 'EXPULSION') {
                    detail.studyEndDate = orderDateIso;
                }
                studentDetails.set(id, detail);
            });
            renderStudentDetails();
        };

        const pruneSelectedStudentsByType = () => {
            let removed = 0;
            selectedStudents.forEach((student, id) => {
                const eligibility = getEligibility(student);
                if (!eligibility.eligible) {
                    selectedStudents.delete(id);
                    studentDetails.delete(id);
                    removed += 1;
                }
            });
            if (removed > 0) {
                toast(`Исключено студентов из выбора: ${removed}`, 'danger');
            }
            renderSelectedStudents();
        };

        const renderCandidates = (students) => {
            if (!students || students.length === 0) {
                selectorTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Студенты не найдены</td></tr>';
                return;
            }

            selectorTableBody.innerHTML = students.map(student => {
                const checked = selectedStudents.has(student.id);
                const eligibility = getEligibility(student);
                const disabled = !eligibility.eligible && !checked;
                const checkboxAttrs = `${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}`;
                const availabilityClass = eligibility.eligible ? 'text-success' : 'text-danger';
                return `<tr data-id="${student.id}">
                    <td class="col-check">
                        <input class="form-check-input order-student-check" type="checkbox" data-id="${student.id}" ${checkboxAttrs}>
                    </td>
                    <td class="col-fio fw-semibold">${student.fullName}</td>
                    <td class="col-record-book">${safeValue(student.recordBook)}</td>
                    <td class="col-group"><span class="badge text-bg-light">${safeValue(student.groupCode)}</span></td>
                    <td class="col-direction">${safeValue(student.directionName)}</td>
                    <td class="col-faculty">${safeValue(formatFacultyName(student.facultyName))}</td>
                    <td class="col-status">${getStudentStatusLabel(student.status)}</td>
                    <td class="col-availability ${availabilityClass}">${eligibility.reason}</td>
                </tr>`;
            }).join('');

            selectorTableBody.querySelectorAll('.order-student-check').forEach(check => {
                check.addEventListener('change', (event) => {
                    const studentId = Number(event.currentTarget.dataset.id);
                    const student = currentCandidates.find(item => item.id === studentId);
                    if (!student) return;
                    if (event.currentTarget.checked) {
                        selectedStudents.set(studentId, student);
                        ensureStudentDetail(student);
                    } else {
                        selectedStudents.delete(studentId);
                        studentDetails.delete(studentId);
                    }
                    renderSelectedStudents();
                });
            });
        };

        const renderSelectorPagination = (page, totalPages) => {
            selectorLastTotalPages = totalPages || 0;
            const safeTotal = Math.max(totalPages || 0, 1);
            const displayPage = totalPages === 0 ? 0 : page + 1;
            selectorPaginationInfoEl.textContent = `Стр. ${displayPage} из ${safeTotal}`;
            selectorPagePrevEl.disabled = page <= 0;
            selectorPageNextEl.disabled = totalPages === 0 || page >= totalPages - 1;
        };

        const loadStudentsForSelector = async (options = {}) => {
            if (options.resetPage) {
                selectorCurrentPage = 0;
            }

            const params = new URLSearchParams();
            if (selectorFacultyEl.value) params.append('facultyId', selectorFacultyEl.value);
            if (selectorDirectionEl.value) params.append('directionId', selectorDirectionEl.value);
            if (selectorGroupEl.value) params.append('groupId', selectorGroupEl.value);
            if (selectorStatusEl.value) params.append('status', selectorStatusEl.value);
            if (selectorEducationLevelEl?.value) params.append('educationLevel', selectorEducationLevelEl.value);
            if (selectorCourseEl.value) params.append('course', selectorCourseEl.value);
            if (selectorEducationFormEl?.value) params.append('educationForm', selectorEducationFormEl.value);
            if (selectorAcceleratedEl?.checked) params.append('accelerated', 'true');
            if (selectorSearchEl.value) params.append('search', selectorSearchEl.value.trim());
            params.append('page', selectorCurrentPage);
            params.append('size', selectorPageSize);
            params.append('sortBy', 'name');
            params.append('sortDirection', 'asc');

            const url = `/api/students/search?${params.toString()}`;
            const pageResult = await api(url);
            if (pageResult.totalPages > 0 && selectorCurrentPage >= pageResult.totalPages) {
                selectorCurrentPage = pageResult.totalPages - 1;
                return loadStudentsForSelector();
            }

            currentCandidates = pageResult.content || [];
            renderCandidates(currentCandidates);
            renderSelectorPagination(pageResult.page ?? selectorCurrentPage, pageResult.totalPages ?? 0);
            const totalElements = pageResult.totalElements ?? currentCandidates.length;
            selectorHintEl.textContent = `Выбрано студентов: ${selectedStudents.size} · Найдено: ${totalElements}`;
        };

        const loadFaculties = async () => {
            faculties = mapFacultyForDisplay(await api('/api/faculties'));
            renderSelect(selectorFacultyEl, faculties, 'Все');
        };

        const loadSelectorDirections = async (facultyId, options = {}) => {
            const preserveDirection = options.preserveDirection !== false;
            const previousDirectionId = preserveDirection ? String(selectorDirectionEl.value || '') : '';
            const previousGroupId = String(options.preferredGroupId || selectorGroupEl.value || '');
            const url = facultyId ? `/api/directions?facultyId=${facultyId}` : '/api/directions';
            selectorDirections = await api(url);
            renderSelect(selectorDirectionEl, selectorDirections, 'Все');
            if (previousDirectionId && selectorDirections.some(direction => String(direction.id) === previousDirectionId)) {
                selectorDirectionEl.value = previousDirectionId;
            } else if (options.selectedDirectionId) {
                const requestedDirectionId = String(options.selectedDirectionId);
                if (selectorDirections.some(direction => String(direction.id) === requestedDirectionId)) {
                    selectorDirectionEl.value = requestedDirectionId;
                }
            }
            await loadSelectorGroups({
                facultyId: selectorFacultyEl.value,
                directionId: selectorDirectionEl.value,
                preferredGroupId: previousGroupId
            });
        };

        const loadSelectorGroups = async (options = {}) => {
            const preferredGroupId = String(options.preferredGroupId || selectorGroupEl.value || '');
            const effectiveDirectionId = options.directionId !== undefined
                ? String(options.directionId || '')
                : String(selectorDirectionEl.value || '');
            const effectiveFacultyId = options.facultyId !== undefined
                ? String(options.facultyId || '')
                : String(selectorFacultyEl.value || '');

            const allSelectorGroups = await api('/api/groups');
            selectorGroups = allSelectorGroups.filter(group => {
                const directionMatch = !effectiveDirectionId || String(group.directionId) === effectiveDirectionId;
                const facultyMatch = !effectiveFacultyId || String(group.facultyId) === effectiveFacultyId;
                return directionMatch && facultyMatch;
            });
            renderSelect(selectorGroupEl, selectorGroups, 'Все', 'code');
            if (preferredGroupId && selectorGroups.some(group => String(group.id) === preferredGroupId)) {
                selectorGroupEl.value = preferredGroupId;
            }
        };

        const loadStaticReferences = async () => {
            allDirections = await api('/api/directions');
            directionById.clear();
            allDirections.forEach(direction => {
                directionById.set(Number(direction.id), direction);
            });

            allGroups = await api('/api/groups');
            groupsByDirection.clear();
            allGroups.forEach(group => {
                const key = Number(group.directionId);
                if (!groupsByDirection.has(key)) {
                    groupsByDirection.set(key, []);
                }
                groupsByDirection.get(key).push(group);
            });
            groupsByDirection.forEach(list => {
                list.sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), 'ru-RU', {numeric: true, sensitivity: 'base'}));
            });
        };

        const applySelectorGroupDependencies = async (groupId) => {
            const normalizedGroupId = String(groupId || '');
            if (!normalizedGroupId) {
                return;
            }
            const selectedGroup = selectorGroups.find(group => String(group.id) === normalizedGroupId)
                || allGroups.find(group => String(group.id) === normalizedGroupId);
            if (!selectedGroup) {
                return;
            }

            const selectedFacultyId = String(selectedGroup.facultyId || '');
            const selectedDirectionId = String(selectedGroup.directionId || '');
            const selectedCourse = selectedGroup.course != null ? String(selectedGroup.course) : '';
            const selectedEducationLevel = String(selectedGroup.educationLevel || '');
            const selectedEducationForm = String(selectedGroup.educationForm || '');
            const selectedAccelerated = Boolean(selectedGroup.accelerated);

            if (selectedFacultyId) {
                selectorFacultyEl.value = selectedFacultyId;
            }

            await loadSelectorDirections(selectorFacultyEl.value, {
                preserveDirection: false,
                selectedDirectionId,
                preferredGroupId: normalizedGroupId
            });

            if (selectedDirectionId) {
                selectorDirectionEl.value = selectedDirectionId;
            }
            if (selectedCourse) {
                selectorCourseEl.value = selectedCourse;
            }
            if (selectorEducationLevelEl) {
                selectorEducationLevelEl.value = selectedEducationLevel;
            }
            if (selectorEducationFormEl) {
                selectorEducationFormEl.value = selectedEducationForm;
            }
            if (selectorAcceleratedEl) {
                selectorAcceleratedEl.checked = selectedAccelerated;
            }
            selectorGroupEl.value = normalizedGroupId;
        };

        const loadStudentById = async (id) => {
            try {
                return await api(`/api/students/${id}`);
            } catch (err) {
                return null;
            }
        };

        const loadStudentsByIds = async (ids) => {
            if (!Array.isArray(ids) || ids.length === 0) return [];
            const loadedStudents = await Promise.all(ids.map(loadStudentById));
            return loadedStudents.filter(Boolean);
        };

        const buildFallbackStudentFromOrderItem = (item) => {
            if (!item || item.studentId == null) {
                return null;
            }
            const fallbackId = Number(item.studentId);
            if (Number.isNaN(fallbackId) || fallbackId <= 0) {
                return null;
            }
            return {
                id: fallbackId,
                fullName: safeValue(item.studentName) || `Студент #${fallbackId}`,
                recordBook: '',
                course: parseNumericInput(item.fromCourse) || parseNumericInput(item.toCourse) || null,
                status: '',
                groupId: parseNumericInput(item.fromGroupId) || parseNumericInput(item.toGroupId) || null,
                groupCode: safeValue(item.fromGroup) || safeValue(item.toGroup),
                directionId: parseNumericInput(item.fromDirectionId) || parseNumericInput(item.toDirectionId) || null,
                directionCode: '',
                directionName: safeValue(item.fromDirection) || safeValue(item.toDirection),
                facultyId: null,
                facultyName: safeValue(item.facultyName),
                facultyShortName: safeValue(item.facultyShortName) || safeValue(item.facultyName),
                educationForm: safeValue(item.educationForm),
                educationBase: safeValue(item.educationBase),
                hasAcademicDebts: Boolean(item.hasAcademicDebts),
                studyContractNumber: safeValue(item.contractNumber),
                studyStartDate: item.studyStartDate || null
            };
        };

        const setOrderDateValue = (isoDate) => {
            orderDateEl.value = formatIsoDateToRu(isoDate);
        };

        const fillOrderForm = async (order, options = {}) => {
            const assignId = options.assignId !== false;
            const disableType = options.disableType === true;
            const isReadOnlyView = Boolean(order?.signed) || Boolean(order?.executed);

            orderIdEl.value = assignId ? order.id : '';
            orderNumberEl.value = safeValue(order.number);
            setOrderDateValue(order.orderDate);
            orderTypeEl.value = order.type;
            orderTypeEl.disabled = disableType;
            if (orderFormTitleEl && assignId) {
                orderFormTitleEl.textContent = getOrderFormTitle(order.type);
            }
            syncOrderNumberWithOrderContext({clearSequenceOnConflict: false, showConflictHint: false});
            validateOrderDateInput();
            validateOrderNumberInput();

            selectedStudents.clear();
            studentDetails.clear();

            const students = await loadStudentsByIds(Array.isArray(order.studentIds) ? order.studentIds : []);
            students.forEach(student => selectedStudents.set(student.id, student));

            if (Array.isArray(order.studentItems)) {
                order.studentItems.forEach(item => {
                    if (!item || !item.studentId) return;
                    studentDetails.set(item.studentId, {...item});
                });
            }

            if (isReadOnlyView && Array.isArray(order.studentItems)) {
                order.studentItems.forEach((item) => {
                    if (!item || item.studentId == null) return;
                    const studentId = Number(item.studentId);
                    if (Number.isNaN(studentId) || selectedStudents.has(studentId)) return;
                    const fallbackStudent = buildFallbackStudentFromOrderItem(item);
                    if (fallbackStudent) {
                        selectedStudents.set(studentId, fallbackStudent);
                    }
                });
            }

            selectedStudents.forEach(student => {
                const existing = studentDetails.get(student.id) || {};
                const merged = {
                    ...buildDefaultStudentDetail(student),
                    ...existing
                };
                studentDetails.set(student.id, hydrateStudentDetail(student, merged));
            });

            renderSelectedStudents();
            if (selectedStudents.size === 0 && (order.studentsList || '').trim()) {
                studentsListEl.value = order.studentsList;
                studentsListEl.setCustomValidity('');
                selectedStudentsPreviewEl.textContent = 'Список студентов загружен из существующего приказа.';
            }

            updateExecuteButtonState(order, {assignId});
        };

        const buildStudentItemsPayload = () => {
            const selectedList = Array.from(selectedStudents.values());
            const orderDateIso = getOrderDateIso();
            const orderDateText = formatOrderDateText(orderDateIso);
            const orderDateShort = orderDateIso
                ? `${orderDateIso.slice(8, 10)}.${orderDateIso.slice(5, 7)}.${orderDateIso.slice(2, 4)}`
                : '';

            return selectedList.map(student => {
                const detail = studentDetails.get(student.id) || buildDefaultStudentDetail(student);
                const resolvedFaculty = detail.facultyId
                    ? faculties.find(faculty => Number(faculty.id) === Number(detail.facultyId))
                    : null;
                const normalizedTuition = normalizeMoneyForApi(detail.tuitionAmount || '');
                const normalized = {
                    studentId: student.id,
                    studentName: student.fullName,
                    fromCourse: parseNumericInput(detail.fromCourse),
                    toCourse: parseNumericInput(detail.toCourse),
                    hasAcademicDebts: Boolean(detail.hasAcademicDebts),
                    facultyName: (detail.facultyName || resolvedFaculty?.name || student.facultyName || '').trim(),
                    facultyShortName: (detail.facultyShortName || resolvedFaculty?.shortName || resolvedFaculty?.name || student.facultyShortName || student.facultyName || '').trim(),
                    fromGroup: (detail.fromGroup || student.groupCode || '').trim(),
                    toGroup: (detail.toGroup || '').trim(),
                    fromDirection: (detail.fromDirection || '').trim(),
                    toDirection: (detail.toDirection || '').trim(),
                    fromDirectionId: parseNumericInput(detail.fromDirectionId),
                    toDirectionId: parseNumericInput(detail.toDirectionId),
                    fromGroupId: parseNumericInput(detail.fromGroupId),
                    toGroupId: parseNumericInput(detail.toGroupId),
                    educationForm: (detail.educationForm || student.educationForm || '').trim(),
                    educationBase: (detail.educationBase || student.educationBase || '').trim(),
                    periodStart: normalizeOrderDetailDate(detail.periodStart),
                    periodEnd: normalizeOrderDetailDate(detail.periodEnd),
                    studyStartDate: normalizeOrderDetailDate(detail.studyStartDate) || student.studyStartDate || null,
                    studyEndDate: normalizeOrderDetailDate(detail.studyEndDate),
                    specialityName: (detail.specialityName || '').trim(),
                    contractInfo: (detail.contractInfo || '').trim(),
                    contractNumber: (detail.contractNumber || student.studyContractNumber || '').trim(),
                    tuitionAmount: normalizedTuition || safeValue(detail.tuitionAmount).trim(),
                    basis: (detail.basis || '').trim(),
                    extraInfo: (detail.extraInfo || '').trim()
                };

                if (orderTypeEl.value === 'TRANSFER_NEXT_COURSE') {
                    const basisDateIso = normalized.periodStart || orderDateIso;
                    const basisDateShort = basisDateIso
                        ? `${basisDateIso.slice(8, 10)}.${basisDateIso.slice(5, 7)}.${basisDateIso.slice(2, 4)}`
                        : '___';
                    normalized.periodStart = basisDateIso;
                    normalized.basis = normalized.hasAcademicDebts
                        ? `на основании завершённой сессии и решения деканата от ${basisDateShort}`
                        : `на основании завершённой сессии без академических задолженностей и решения деканата от ${basisDateShort}`;
                }
                if (orderTypeEl.value === 'TRANSFER_DIRECTION') {
                    const basisDateIso = normalized.periodStart || orderDateIso;
                    const basisDateShort = basisDateIso
                        ? `${basisDateIso.slice(8, 10)}.${basisDateIso.slice(5, 7)}.${basisDateIso.slice(2, 4)}`
                        : '___';
                    normalized.periodStart = basisDateIso;
                    normalized.toCourse = normalized.fromCourse;
                    normalized.basis = `на основании заявления студента и решения комиссии от ${basisDateShort}`;
                    const direction = getDirectionById(normalized.toDirectionId);
                    if (direction) {
                        normalized.toDirection = directionLabel(direction);
                    }
                }
                if (orderTypeEl.value === 'ACADEMIC_LEAVE') {
                    normalized.periodStart = normalized.periodStart || orderDateIso;
                    normalized.basis = normalized.basis || 'заявление студента с визой декана';
                }
                if (orderTypeEl.value === 'EXPULSION') {
                    normalized.studyEndDate = orderDateIso;
                    normalized.basis = normalized.basis || 'заявление студента с визой декана';
                }
                if (orderTypeEl.value === 'ENROLLMENT') {
                    normalized.toCourse = 1;
                    normalized.periodStart = normalized.periodStart || orderDateIso;
                    const decisionDateIso = normalized.periodStart || orderDateIso;
                    const decisionDateText = formatOrderDateText(decisionDateIso);
                    normalized.basis = `на основании решения приёмной комиссии и приказа от ${decisionDateText}`;
                    if (normalized.educationBase === 'Бюджет') {
                        normalized.tuitionAmount = '0.00';
                    } else if (!normalized.tuitionAmount) {
                        normalized.tuitionAmount = normalizeMoneyForApi(getDirectionTuition(normalized.toDirectionId || normalized.fromDirectionId) || '0,00');
                    }
                }

                return normalized;
            });
        };

        const createPayload = () => {
            const orderDateIso = getOrderDateIso();
            const selectedIds = Array.from(selectedStudents.keys());
            const studentItems = buildStudentItemsPayload();

            return {
                number: orderNumberEl.value.trim(),
                orderDate: orderDateIso,
                type: orderTypeEl.value,
                signerName: '',
                signerPosition: '',
                signDate: null,
                studentsList: studentsListEl.value,
                studentIds: selectedIds,
                studentItems,
                periodStart: null,
                periodEnd: null,
                basis: '',
                directionName: '',
                groupCode: '',
                educationForm: '',
                educationBase: '',
                costInfo: '',
                expelDate: null,
                contractInfo: '',
                oldDirection: '',
                oldGroup: '',
                newDirection: '',
                newGroup: '',
                previousCourse: null,
                nextCourse: null
            };
        };

        const saveOrder = async () => {
            syncOrderNumberWithOrderContext({clearSequenceOnConflict: true, showConflictHint: true});
            const dateValid = validateOrderDateInput();
            const numberValid = validateOrderNumberInput();
            syncStudentDetailsFromInputs();
            const decisionDatesValid = validateAllDecisionDateInputs();
            if (!dateValid || !numberValid || !decisionDatesValid || !form.checkValidity()) {
                form.classList.add('was-validated');
                if (!dateValid) {
                    toast(orderDateEl.validationMessage || 'Укажите корректную дату приказа', 'danger');
                } else if (!numberValid) {
                    toast(orderNumberEl.validationMessage || 'Укажите корректный номер приказа', 'danger');
                } else if (!decisionDatesValid) {
                    toast(decisionDateValidationMessage, 'danger');
                }
                return;
            }

            if (selectedStudents.size === 0 && !studentsListEl.value.trim()) {
                studentsListEl.setCustomValidity('Выберите хотя бы одного студента');
                form.classList.add('was-validated');
                toast('Нужно выбрать хотя бы одного студента', 'danger');
                return;
            }
            studentsListEl.setCustomValidity('');

            const payload = createPayload();

            if (orderTypeEl.value === 'ACADEMIC_LEAVE' || orderTypeEl.value === 'EXPULSION') {
                const missingBasisItem = (payload.studentItems || []).find(item => !item.basis);
                if (missingBasisItem) {
                    toast(`Заполните основание для студента: ${missingBasisItem.studentName}`, 'danger');
                    return;
                }
            }

            const existingId = orderIdEl.value;
            const url = existingId ? `/api/orders/${existingId}` : '/api/orders';
            const method = existingId ? 'PUT' : 'POST';
            await api(url, {method, body: JSON.stringify(payload)});
            toast('Приказ сохранён');
            window.location.href = '/orders.html';
        };

        const executeCurrentOrder = async () => {
            const orderId = Number(orderIdEl.value);
            if (!Number.isFinite(orderId)) {
                toast('Сначала сохраните приказ.', 'danger');
                return;
            }
            if (!isExecutableOrderType(orderTypeEl.value)) {
                toast('Этот тип приказа не требует осуществления.', 'danger');
                return;
            }

            const confirmed = await confirmAction({
                title: 'Осуществление приказа',
                message: 'Осуществить приказ сейчас? Изменения по студентам будут применены в базе.',
                confirmText: 'Осуществить',
                confirmClass: 'btn-dark'
            });
            if (!confirmed) {
                return;
            }

            await api(`/api/orders/${orderId}/execute`, {method: 'POST'});
            toast('Приказ осуществлён');
            const updatedOrder = await api(`/api/orders/${orderId}`);
            await fillOrderForm(updatedOrder, {disableType: true});
        };

        const signCurrentOrder = async () => {
            const orderId = Number(orderIdEl.value);
            if (!Number.isFinite(orderId)) {
                toast('Сначала сохраните приказ.', 'danger');
                return;
            }

            const confirmed = await confirmAction({
                title: 'Подписание приказа',
                message: 'Подписать приказ? После подписания редактирование и откат будут недоступны.',
                confirmText: 'Подписать',
                confirmClass: 'btn-dark'
            });
            if (!confirmed) {
                return;
            }

            await api(`/api/orders/${orderId}/sign`, {method: 'POST'});
            toast('Приказ подписан');
            const updatedOrder = await api(`/api/orders/${orderId}`);
            await fillOrderForm(updatedOrder, {disableType: true});
        };

        orderTypeEl.addEventListener('change', () => {
            syncOrderNumberWithOrderContext({clearSequenceOnConflict: true, showConflictHint: true});
            validateOrderNumberInput();
            pruneSelectedStudentsByType();
            resetSelectedDetailsByType();
            loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
        });

        orderDateEl.addEventListener('input', () => {
            applyOrderDateMask();
            validateOrderDateInput();
            syncOrderNumberWithOrderContext({clearSequenceOnConflict: true, showConflictHint: true});
            validateOrderNumberInput();
            validateAllDecisionDateInputs();
        });

        orderDateEl.addEventListener('change', () => {
            validateOrderDateInput();
            syncOrderNumberWithOrderContext({clearSequenceOnConflict: true, showConflictHint: true});
            validateOrderNumberInput();
            syncOrderDateToDetails();
            validateAllDecisionDateInputs();
        });
        orderDateEl.addEventListener('blur', () => {
            validateOrderDateInput();
        });

        orderNumberEl.addEventListener('input', () => {
            syncOrderNumberWithOrderContext({clearSequenceOnConflict: false, showConflictHint: false});
            validateOrderNumberInput();
        });
        orderNumberEl.addEventListener('blur', () => {
            syncOrderNumberWithOrderContext({clearSequenceOnConflict: true, showConflictHint: true});
            validateOrderNumberInput();
        });

        selectorFacultyEl.addEventListener('change', () => {
            loadSelectorDirections(selectorFacultyEl.value, {preserveDirection: true})
                .then(() => loadStudentsForSelector({resetPage: true}))
                .catch(err => toast(err.message, 'danger'));
        });
        selectorDirectionEl.addEventListener('change', () => {
            loadSelectorGroups({
                facultyId: selectorFacultyEl.value,
                directionId: selectorDirectionEl.value
            })
                .then(() => loadStudentsForSelector({resetPage: true}))
                .catch(err => toast(err.message, 'danger'));
        });
        selectorGroupEl.addEventListener('change', () => {
            const selectedGroupId = selectorGroupEl.value;
            if (!selectedGroupId) {
                loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
                return;
            }
            applySelectorGroupDependencies(selectedGroupId)
                .then(() => loadStudentsForSelector({resetPage: true}))
                .catch(err => toast(err.message, 'danger'));
        });
        selectorStatusEl.addEventListener('change', () => {
            loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
        });
        if (selectorEducationLevelEl) {
            selectorEducationLevelEl.addEventListener('change', () => {
                loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
            });
        }
        selectorCourseEl.addEventListener('change', () => {
            loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
        });
        if (selectorEducationFormEl) {
            selectorEducationFormEl.addEventListener('change', () => {
                loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
            });
        }
        if (selectorAcceleratedEl) {
            selectorAcceleratedEl.addEventListener('change', () => {
                loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
            });
        }
        selectorSearchBtn.addEventListener('click', () => {
            loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
        });
        selectorSearchEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
            }
        });
        if (selectorResetFiltersBtn) {
            selectorResetFiltersBtn.addEventListener('click', () => {
                selectorFacultyEl.value = '';
                selectorDirectionEl.value = '';
                selectorGroupEl.value = '';
                selectorStatusEl.value = '';
                if (selectorEducationLevelEl) selectorEducationLevelEl.value = '';
                selectorCourseEl.value = '';
                if (selectorEducationFormEl) selectorEducationFormEl.value = '';
                if (selectorAcceleratedEl) selectorAcceleratedEl.checked = false;
                selectorSearchEl.value = '';
                loadSelectorDirections('', {preserveDirection: false})
                    .then(() => loadStudentsForSelector({resetPage: true}))
                    .catch(err => toast(err.message, 'danger'));
            });
        }
        selectorPagePrevEl.addEventListener('click', () => {
            if (selectorCurrentPage > 0) {
                selectorCurrentPage -= 1;
                loadStudentsForSelector().catch(err => toast(err.message, 'danger'));
            }
        });
        selectorPageNextEl.addEventListener('click', () => {
            if (selectorCurrentPage < selectorLastTotalPages - 1) {
                selectorCurrentPage += 1;
                loadStudentsForSelector().catch(err => toast(err.message, 'danger'));
            }
        });
        selectorModalEl.addEventListener('shown.bs.modal', () => {
            loadStudentsForSelector({resetPage: true}).catch(err => toast(err.message, 'danger'));
        });
        if (curriculumDiffToggleRowsBtn) {
            curriculumDiffToggleRowsBtn.addEventListener('click', () => {
                curriculumDiffState.showOnlyDifference = !curriculumDiffState.showOnlyDifference;
                renderCurriculumDiffView();
            });
        }
        if (curriculumDiffResetBtn) {
            curriculumDiffResetBtn.addEventListener('click', () => {
                curriculumDiffState.showOnlyDifference = false;
                curriculumDiffState.selectedCourse = curriculumDiffState.fromCourse || curriculumDiffState.selectedCourse;
                curriculumDiffState.selectedSemester = 'all';
                renderCurriculumDiffView();
            });
        }
        if (curriculumDiffToggleDebtBtn) {
            curriculumDiffToggleDebtBtn.addEventListener('click', () => {
                curriculumDiffState.showDebtSummary = !curriculumDiffState.showDebtSummary;
                renderCurriculumDiffView();
            });
        }
        if (curriculumDiffCourseTabsEl) {
            curriculumDiffCourseTabsEl.addEventListener('click', (event) => {
                const button = event.target.closest('[data-diff-course]');
                if (!button) return;
                curriculumDiffState.selectedCourse = Number(button.dataset.diffCourse);
                curriculumDiffState.selectedSemester = 'all';
                renderCurriculumDiffView();
            });
        }
        if (curriculumDiffSemesterTabsEl) {
            curriculumDiffSemesterTabsEl.addEventListener('click', (event) => {
                const button = event.target.closest('[data-diff-semester]');
                if (!button) return;
                curriculumDiffState.selectedSemester = String(button.dataset.diffSemester || 'all');
                renderCurriculumDiffView();
            });
        }
        if (curriculumDiffModalEl) {
            curriculumDiffModalEl.addEventListener('hidden.bs.modal', () => {
                resetCurriculumDiffState();
                if (curriculumDiffTargetTableEl) {
                    curriculumDiffTargetTableEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
                }
                if (curriculumDiffSourceTableEl) {
                    curriculumDiffSourceTableEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Нет данных</td></tr>';
                }
                if (curriculumDiffDebtTableEl) {
                    curriculumDiffDebtTableEl.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Нет данных</td></tr>';
                }
                if (curriculumDiffCourseTabsEl) {
                    curriculumDiffCourseTabsEl.innerHTML = '';
                }
                if (curriculumDiffSemesterTabsEl) {
                    curriculumDiffSemesterTabsEl.innerHTML = '';
                }
                if (curriculumDiffDebtCountEl) {
                    curriculumDiffDebtCountEl.textContent = '0';
                }
                if (curriculumDiffDebtPanelEl) {
                    curriculumDiffDebtPanelEl.classList.add('d-none');
                }
            });
        }
        saveBtn.addEventListener('click', () => {
            saveOrder().catch(err => toast(err.message, 'danger'));
        });
        if (executeOrderBtn) {
            executeOrderBtn.addEventListener('click', () => {
                executeCurrentOrder().catch(err => toast(err.message, 'danger'));
            });
        }
        if (signOrderBtn) {
            signOrderBtn.addEventListener('click', () => {
                signCurrentOrder().catch(err => toast(err.message, 'danger'));
            });
        }

        setOrderNumberHint(orderNumberDefaultHint, false);
        setOrderNumberPlaceholder();
        bindTextDatePicker(orderDateEl, orderDatePicker);

        (async () => {
            await loadFaculties();
            await loadStaticReferences();
            await loadSelectorDirections();
            renderSelectedStudents();

            if (orderIdFromPage) {
                printOrderBtn.href = `/api/orders/${orderIdFromPage}/pdf`;
                printOrderBtn.classList.remove('d-none');
                const order = await api(`/api/orders/${orderIdFromPage}`);
                await fillOrderForm(order, {disableType: true});
            } else {
                setOrderDateValue(getTodayIsoDate());
            }

            syncOrderNumberWithOrderContext({clearSequenceOnConflict: false, showConflictHint: false});
            validateOrderDateInput();
            validateOrderNumberInput();
            await loadStudentsForSelector({resetPage: true});
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Отчёты =====
    function initReportsPage() {
        const page = document.getElementById('reportsPage');
        if (!page) return;

        const fromInput = document.getElementById('reportFrom');
        const toInput = document.getElementById('reportTo');
        const fromPickerBtn = document.getElementById('reportFromPicker');
        const toPickerBtn = document.getElementById('reportToPicker');
        const reloadBtn = document.getElementById('reloadReports');
        const applyBtn = document.getElementById('applyReportFilters');
        const resetBtn = document.getElementById('resetReportFilters');
        const facultyBody = document.getElementById('facultyReportBody');
        const directionBody = document.getElementById('directionReportBody');
        const groupBody = document.getElementById('groupReportBody');
        const directionFacultyFilters = document.getElementById('directionFacultyFilters');
        const directionFiltersClearBtn = document.getElementById('directionFiltersClear');
        const groupFacultyFilters = document.getElementById('groupFacultyFilters');
        const groupDirectionFilters = document.getElementById('groupDirectionFilters');
        const groupCourseFilters = document.getElementById('groupCourseFilters');
        const directionSortBy = document.getElementById('directionSortBy');
        const directionSortDir = document.getElementById('directionSortDir');
        const groupSortBy = document.getElementById('groupSortBy');
        const groupSortDir = document.getElementById('groupSortDir');
        const groupFiltersClearBtn = document.getElementById('groupFiltersClear');
        const facultyPageSize = document.getElementById('facultyReportPageSize');
        const facultyShowAllBtn = document.getElementById('facultyReportShowAll');
        const facultyPageFirst = document.getElementById('facultyReportPageFirst');
        const facultyPagePrev = document.getElementById('facultyReportPagePrev');
        const facultyPageNumbers = document.getElementById('facultyReportPageNumbers');
        const facultyPageNext = document.getElementById('facultyReportPageNext');
        const facultyPageLast = document.getElementById('facultyReportPageLast');
        const directionPageSize = document.getElementById('directionReportPageSize');
        const directionShowAllBtn = document.getElementById('directionReportShowAll');
        const directionPageFirst = document.getElementById('directionReportPageFirst');
        const directionPagePrev = document.getElementById('directionReportPagePrev');
        const directionPageNumbers = document.getElementById('directionReportPageNumbers');
        const directionPageNext = document.getElementById('directionReportPageNext');
        const directionPageLast = document.getElementById('directionReportPageLast');
        const groupPageSize = document.getElementById('groupReportPageSize');
        const groupShowAllBtn = document.getElementById('groupReportShowAll');
        const groupPageFirst = document.getElementById('groupReportPageFirst');
        const groupPagePrev = document.getElementById('groupReportPagePrev');
        const groupPageNumbers = document.getElementById('groupReportPageNumbers');
        const groupPageNext = document.getElementById('groupReportPageNext');
        const groupPageLast = document.getElementById('groupReportPageLast');

        const totalEl = document.getElementById('reportTotal');
        const activeEl = document.getElementById('reportActive');
        const academicEl = document.getElementById('reportAcademic');
        const expelledEl = document.getElementById('reportExpelled');
        const graduatedEl = document.getElementById('reportGraduated');
        const facultyCount = document.getElementById('facultyCount');
        const directionCount = document.getElementById('directionCount');
        const groupCount = document.getElementById('groupCount');

        let reportData = {
            total: 0,
            faculties: [],
            directions: [],
            groups: []
        };
        const directionFacultySelected = new Set();
        const groupFacultySelected = new Set();
        const groupDirectionSelected = new Set();
        const groupCourseSelected = new Set();
        const NONE_SELECTED_KEY = '__none_selected__';
        const hasNoneSelection = (selectedSet) => selectedSet.has(NONE_SELECTED_KEY);
        const isAllSelection = (selectedSet) => selectedSet.size === 0;
        const clearAllSelection = (selectedSet) => {
            selectedSet.clear();
            selectedSet.add(NONE_SELECTED_KEY);
        };
        const createReportPager = (sizeSelect, showAllBtn, firstBtn, prevBtn, numbersEl, nextBtn, lastBtn) => ({
            sizeSelect,
            showAllBtn,
            firstBtn,
            prevBtn,
            numbersEl,
            nextBtn,
            lastBtn,
            page: 0,
            showAll: false
        });
        const facultyPager = createReportPager(
            facultyPageSize,
            facultyShowAllBtn,
            facultyPageFirst,
            facultyPagePrev,
            facultyPageNumbers,
            facultyPageNext,
            facultyPageLast
        );
        const directionPager = createReportPager(
            directionPageSize,
            directionShowAllBtn,
            directionPageFirst,
            directionPagePrev,
            directionPageNumbers,
            directionPageNext,
            directionPageLast
        );
        const groupPager = createReportPager(
            groupPageSize,
            groupShowAllBtn,
            groupPageFirst,
            groupPagePrev,
            groupPageNumbers,
            groupPageNext,
            groupPageLast
        );
        const resetReportPager = (pager) => {
            if (!pager) return;
            pager.page = 0;
        };
        const resetAllReportPagers = () => {
            resetReportPager(facultyPager);
            resetReportPager(directionPager);
            resetReportPager(groupPager);
        };
        const resetDirectionSorting = () => {
            if (directionSortBy) directionSortBy.value = 'alpha';
            if (directionSortDir) directionSortDir.value = 'asc';
        };
        const resetGroupSorting = () => {
            if (groupSortBy) groupSortBy.value = 'alpha';
            if (groupSortDir) groupSortDir.value = 'asc';
        };

        const formatNumber = (value) => typeof value === 'number' ? value.toLocaleString('ru-RU') : '—';
        const escapeHtml = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const optionLabelCompare = (left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'ru-RU', {
            numeric: true,
            sensitivity: 'base'
        });
        const collator = new Intl.Collator('ru-RU', {
            numeric: true,
            sensitivity: 'base'
        });
        const compareText = (left, right) => collator.compare(String(left ?? ''), String(right ?? ''));
        const compareNumber = (left, right) => {
            const l = Number.isFinite(Number(left)) ? Number(left) : Number.NEGATIVE_INFINITY;
            const r = Number.isFinite(Number(right)) ? Number(right) : Number.NEGATIVE_INFINITY;
            return l - r;
        };
        const makeEntityKey = (prefix, id, name) => {
            if (id === null || id === undefined) {
                return `${prefix}:name:${String(name || '').trim().toLowerCase()}`;
            }
            return `${prefix}:id:${id}`;
        };
        const getFacultyKey = (row) => makeEntityKey('faculty', row.facultyId, row.facultyName);
        const getDirectionKey = (row) => makeEntityKey('direction', row.directionId, row.directionName);
        const getCourseKey = (row) => row.groupCourse === null || row.groupCourse === undefined
            ? 'course:none'
            : `course:${row.groupCourse}`;
        const matchesSelection = (value, selectedSet) => {
            // Пустой/снятый выбор в чекбоксах трактуем как "без ограничения".
            if (hasNoneSelection(selectedSet)) {
                return true;
            }
            return selectedSet.size === 0 || selectedSet.has(value);
        };

        const calcTotals = (rows) => rows.reduce((acc, row) => {
            acc.total += row.total;
            acc.active += row.active;
            acc.academicLeave += row.academicLeave;
            acc.expelled += row.expelled;
            acc.graduated += row.graduated;
            return acc;
        }, {total: 0, active: 0, academicLeave: 0, expelled: 0, graduated: 0});

        const renderSummary = (data) => {
            const totals = calcTotals(data.groups || []);
            totalEl.textContent = formatNumber(data.total ?? totals.total);
            activeEl.textContent = formatNumber(totals.active);
            academicEl.textContent = formatNumber(totals.academicLeave);
            expelledEl.textContent = formatNumber(totals.expelled);
            graduatedEl.textContent = formatNumber(totals.graduated);
        };

        const buildOptions = (rows, keyFn, labelFn) => {
            const unique = new Map();
            rows.forEach((row) => {
                const key = keyFn(row);
                if (!key) return;
                if (!unique.has(key)) {
                    unique.set(key, labelFn(row));
                }
            });
            return Array.from(unique.entries())
                .map(([value, label]) => ({value, label}))
                .sort(optionLabelCompare);
        };

        const trimSelectedToOptions = (selectedSet, options) => {
            const valid = new Set(options.map((option) => option.value));
            Array.from(selectedSet).forEach((key) => {
                if (key === NONE_SELECTED_KEY) {
                    return;
                }
                if (!valid.has(key)) {
                    selectedSet.delete(key);
                }
            });
        };

        const renderCheckboxFilter = (container, options, selectedSet, onChange, emptyText) => {
            if (!container) return;
            if (!options.length) {
                container.innerHTML = `<div class="text-muted small">${escapeHtml(emptyText || 'Нет данных')}</div>`;
                return;
            }

            const selectAllMode = isAllSelection(selectedSet);
            const noneSelected = hasNoneSelection(selectedSet);
            container.innerHTML = options.map((option, index) => {
                const checked = !noneSelected && (selectAllMode || selectedSet.has(option.value)) ? 'checked' : '';
                const checkboxId = `${container.id}-${index}`;
                return `<div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${escapeHtml(option.value)}" id="${escapeHtml(checkboxId)}" ${checked}>
                    <label class="form-check-label" for="${escapeHtml(checkboxId)}">${escapeHtml(option.label)}</label>
                </div>`;
            }).join('');

            const inputs = Array.from(container.querySelectorAll('input[type="checkbox"]'));
            inputs.forEach((input) => {
                input.addEventListener('change', () => {
                    const selected = inputs.filter(item => item.checked).map(item => item.value);
                    selectedSet.clear();
                    if (selected.length === 0) {
                        selectedSet.add(NONE_SELECTED_KEY);
                    } else if (selected.length !== options.length) {
                        selected.forEach((value) => selectedSet.add(value));
                    }
                    onChange();
                });
            });
        };

        const renderTable = (tbody, rows, renderRow) => {
            if (!rows || rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${tbody.id === 'groupReportBody' ? 8 : tbody.id === 'directionReportBody' ? 7 : 6}" class="text-center text-muted py-3">Нет данных за выбранный период</td></tr>`;
                return;
            }
            tbody.innerHTML = rows.map(renderRow).join('');
        };

        const paginateReportRows = (rows, pager) => {
            if (!pager) {
                return {
                    page: 0,
                    totalPages: rows.length ? 1 : 0,
                    content: rows
                };
            }
            const baseSize = Number(pager.sizeSelect?.value) || 10;
            const pageSize = pager.showAll ? Math.max(rows.length, 1) : baseSize;
            const paged = paginateLocal(rows, pager.page, pageSize);
            pager.page = paged.page;
            return paged;
        };

        const renderReportPager = (pager, totalItems, pagedResult) => {
            if (!pager) return;
            renderPaginationControls({
                page: pagedResult.page,
                totalPages: pagedResult.totalPages,
                firstBtn: pager.firstBtn,
                prevBtn: pager.prevBtn,
                numbersEl: pager.numbersEl,
                nextBtn: pager.nextBtn,
                lastBtn: pager.lastBtn
            });
            if (pager.showAllBtn) {
                pager.showAllBtn.disabled = totalItems === 0 || pager.showAll;
            }
        };

        const bindReportPager = (pager, onChange) => {
            if (!pager || !pager.numbersEl) return;

            if (pager.sizeSelect) {
                pager.sizeSelect.addEventListener('change', () => {
                    pager.showAll = false;
                    pager.page = 0;
                    onChange();
                });
            }
            if (pager.showAllBtn) {
                pager.showAllBtn.addEventListener('click', () => {
                    pager.showAll = true;
                    pager.page = 0;
                    onChange();
                });
            }
            if (pager.firstBtn) {
                pager.firstBtn.addEventListener('click', () => {
                    if (pager.page === 0) return;
                    pager.page = 0;
                    onChange();
                });
            }
            if (pager.prevBtn) {
                pager.prevBtn.addEventListener('click', () => {
                    if (pager.page <= 0) return;
                    pager.page -= 1;
                    onChange();
                });
            }
            if (pager.nextBtn) {
                pager.nextBtn.addEventListener('click', () => {
                    pager.page += 1;
                    onChange();
                });
            }
            if (pager.lastBtn) {
                pager.lastBtn.addEventListener('click', () => {
                    pager.page = Number.MAX_SAFE_INTEGER;
                    onChange();
                });
            }
            pager.numbersEl.addEventListener('click', (event) => {
                const target = event.target.closest('button[data-page-index]');
                if (!target) return;
                const nextPage = Number(target.dataset.pageIndex);
                if (Number.isNaN(nextPage)) return;
                pager.page = nextPage;
                onChange();
            });
        };

        const rowCells = (row) => `
            <td class="text-end fw-semibold">${formatNumber(row.total)}</td>
            <td class="text-end">${formatNumber(row.active)}</td>
            <td class="text-end">${formatNumber(row.academicLeave)}</td>
            <td class="text-end">${formatNumber(row.expelled)}</td>
            <td class="text-end">${formatNumber(row.graduated)}</td>
        `;

        const filteredDirectionRows = () => reportData.directions.filter((row) => {
            return matchesSelection(getFacultyKey(row), directionFacultySelected);
        });

        const groupRowsBySelectedFaculties = () => reportData.groups.filter((row) => {
            return matchesSelection(getFacultyKey(row), groupFacultySelected);
        });

        const filteredGroupRows = () => groupRowsBySelectedFaculties().filter((row) => {
            return matchesSelection(getDirectionKey(row), groupDirectionSelected)
                && matchesSelection(getCourseKey(row), groupCourseSelected);
        });

        const sortDirectionRows = (rows) => {
            const sortBy = directionSortBy?.value || 'alpha';
            const sortDirectionFactor = (directionSortDir?.value || 'asc') === 'desc' ? -1 : 1;
            const sorted = [...rows].sort((left, right) => {
                let result = 0;
                switch (sortBy) {
                    case 'faculty':
                        result = compareText(left.facultyName, right.facultyName);
                        if (result === 0) result = compareText(left.directionName, right.directionName);
                        break;
                    case 'direction':
                    case 'alpha':
                    default:
                        result = compareText(left.directionName, right.directionName);
                        if (result === 0) result = compareText(left.facultyName, right.facultyName);
                        break;
                }
                if (result === 0) {
                    result = compareNumber(left.directionId, right.directionId);
                }
                return result * sortDirectionFactor;
            });
            return sorted;
        };

        const sortGroupRows = (rows) => {
            const sortBy = groupSortBy?.value || 'alpha';
            const sortDirectionFactor = (groupSortDir?.value || 'asc') === 'desc' ? -1 : 1;
            const sorted = [...rows].sort((left, right) => {
                let result = 0;
                switch (sortBy) {
                    case 'faculty':
                        result = compareText(left.facultyName, right.facultyName);
                        if (result === 0) result = compareText(left.directionName, right.directionName);
                        if (result === 0) result = compareNumber(left.groupCourse, right.groupCourse);
                        if (result === 0) result = compareText(left.groupCode, right.groupCode);
                        break;
                    case 'direction':
                        result = compareText(left.directionName, right.directionName);
                        if (result === 0) result = compareText(left.facultyName, right.facultyName);
                        if (result === 0) result = compareNumber(left.groupCourse, right.groupCourse);
                        if (result === 0) result = compareText(left.groupCode, right.groupCode);
                        break;
                    case 'course':
                        result = compareNumber(left.groupCourse, right.groupCourse);
                        if (result === 0) result = compareText(left.facultyName, right.facultyName);
                        if (result === 0) result = compareText(left.directionName, right.directionName);
                        if (result === 0) result = compareText(left.groupCode, right.groupCode);
                        break;
                    case 'alpha':
                    default:
                        result = compareText(left.groupCode, right.groupCode);
                        if (result === 0) result = compareText(left.directionName, right.directionName);
                        if (result === 0) result = compareText(left.facultyName, right.facultyName);
                        if (result === 0) result = compareNumber(left.groupCourse, right.groupCourse);
                        break;
                }
                if (result === 0) {
                    result = compareNumber(left.groupId, right.groupId);
                }
                return result * sortDirectionFactor;
            });
            return sorted;
        };

        const applyReportFilters = () => {
            const directions = sortDirectionRows(filteredDirectionRows());
            const groups = sortGroupRows(filteredGroupRows());
            const pagedFaculties = paginateReportRows(reportData.faculties, facultyPager);
            const pagedDirections = paginateReportRows(directions, directionPager);
            const pagedGroups = paginateReportRows(groups, groupPager);

            facultyCount.textContent = reportData.faculties.length;
            directionCount.textContent = directions.length;
            groupCount.textContent = groups.length;

            renderTable(facultyBody, pagedFaculties.content, (row) => `
                <tr>
                    <td>${safeValue(formatFacultyName(row.facultyName))}</td>
                    ${rowCells(row)}
                </tr>
            `);

            renderTable(directionBody, pagedDirections.content, (row) => `
                <tr>
                    <td>${safeValue(row.directionName)}</td>
                    <td>${safeValue(formatFacultyName(row.facultyName))}</td>
                    ${rowCells(row)}
                </tr>
            `);

            renderTable(groupBody, pagedGroups.content, (row) => `
                <tr>
                    <td><span class="badge text-bg-light">${safeValue(row.groupCode)}</span></td>
                    <td>${safeValue(formatFacultyName(row.facultyName))}</td>
                    <td>${safeValue(row.directionName)}</td>
                    ${rowCells(row)}
                </tr>
            `);

            renderReportPager(facultyPager, reportData.faculties.length, pagedFaculties);
            renderReportPager(directionPager, directions.length, pagedDirections);
            renderReportPager(groupPager, groups.length, pagedGroups);
        };

        const refreshDirectionFilterControls = () => {
            const options = buildOptions(
                reportData.directions,
                getFacultyKey,
                (row) => safeValue(formatFacultyName(row.facultyName)) || 'Без факультета'
            );
            trimSelectedToOptions(directionFacultySelected, options);
            renderCheckboxFilter(
                directionFacultyFilters,
                options,
                directionFacultySelected,
                () => {
                    resetReportPager(directionPager);
                    applyReportFilters();
                },
                'Нет факультетов'
            );
        };

        const refreshGroupFilterControls = () => {
            const facultyOptions = buildOptions(
                reportData.groups,
                getFacultyKey,
                (row) => safeValue(formatFacultyName(row.facultyName)) || 'Без факультета'
            );
            trimSelectedToOptions(groupFacultySelected, facultyOptions);
            renderCheckboxFilter(
                groupFacultyFilters,
                facultyOptions,
                groupFacultySelected,
                () => {
                    resetReportPager(groupPager);
                    refreshGroupFilterControls();
                    applyReportFilters();
                },
                'Нет факультетов'
            );

            const groupsByFaculty = groupRowsBySelectedFaculties();
            const directionOptions = buildOptions(
                groupsByFaculty,
                getDirectionKey,
                (row) => safeValue(row.directionName) || 'Без направления'
            );
            trimSelectedToOptions(groupDirectionSelected, directionOptions);
            renderCheckboxFilter(
                groupDirectionFilters,
                directionOptions,
                groupDirectionSelected,
                () => {
                    resetReportPager(groupPager);
                    refreshGroupFilterControls();
                    applyReportFilters();
                },
                'Нет направлений'
            );

            const groupsByFacultyAndDirection = groupsByFaculty.filter((row) => {
                return matchesSelection(getDirectionKey(row), groupDirectionSelected);
            });
            const courseOptions = buildOptions(
                groupsByFacultyAndDirection,
                getCourseKey,
                (row) => row.groupCourse === null || row.groupCourse === undefined
                    ? 'Без курса'
                    : `${row.groupCourse} курс`
            );
            trimSelectedToOptions(groupCourseSelected, courseOptions);
            renderCheckboxFilter(
                groupCourseFilters,
                courseOptions,
                groupCourseSelected,
                () => {
                    resetReportPager(groupPager);
                    applyReportFilters();
                },
                'Нет курсов'
            );
        };

        const loadReport = async () => {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Загрузка...';
            try {
                const fromIso = parseDateInputToIso(fromInput.value);
                const toIso = parseDateInputToIso(toInput.value);
                if (fromIso === undefined || toIso === undefined) {
                    toast('Некорректная дата. Используйте формат дд.мм.гггг или гггг-мм-дд.', 'danger');
                    return;
                }
                if (fromIso) {
                    fromInput.value = formatIsoDateToRu(fromIso);
                }
                if (toIso) {
                    toInput.value = formatIsoDateToRu(toIso);
                }
                if (fromIso && toIso && fromIso > toIso) {
                    toast('Период задан неверно: дата "с" больше даты "по".', 'danger');
                    return;
                }

                const params = new URLSearchParams();
                if (fromIso) params.append('from', fromIso);
                if (toIso) params.append('to', toIso);
                const url = params.toString() ? `/api/reports/contingent?${params.toString()}` : '/api/reports/contingent';
                const data = await api(url);
                reportData = {
                    total: data.total ?? 0,
                    faculties: Array.isArray(data.faculties) ? data.faculties : [],
                    directions: Array.isArray(data.directions) ? data.directions : [],
                    groups: Array.isArray(data.groups) ? data.groups : []
                };

                resetAllReportPagers();
                renderSummary(reportData);
                refreshDirectionFilterControls();
                refreshGroupFilterControls();
                applyReportFilters();
            } catch (err) {
                toast(`Не удалось построить отчёт: ${err.message}`, 'danger');
            } finally {
                applyBtn.disabled = false;
                applyBtn.innerHTML = '<i class="bi bi-graph-up me-1"></i>Построить отчёт';
            }
        };

        bindReportPager(facultyPager, applyReportFilters);
        bindReportPager(directionPager, applyReportFilters);
        bindReportPager(groupPager, applyReportFilters);

        if (reloadBtn) {
            reloadBtn.addEventListener('click', loadReport);
        }
        applyBtn.addEventListener('click', loadReport);
        resetBtn.addEventListener('click', () => {
            fromInput.value = '';
            toInput.value = '';
            resetDirectionSorting();
            resetGroupSorting();
            loadReport();
        });
        if (directionFiltersClearBtn) {
            directionFiltersClearBtn.addEventListener('click', () => {
                clearAllSelection(directionFacultySelected);
                resetDirectionSorting();
                resetReportPager(directionPager);
                refreshDirectionFilterControls();
                applyReportFilters();
            });
        }
        if (groupFiltersClearBtn) {
            groupFiltersClearBtn.addEventListener('click', () => {
                clearAllSelection(groupFacultySelected);
                clearAllSelection(groupDirectionSelected);
                clearAllSelection(groupCourseSelected);
                resetGroupSorting();
                resetReportPager(groupPager);
                refreshGroupFilterControls();
                applyReportFilters();
            });
        }
        if (directionSortBy) {
            directionSortBy.addEventListener('change', () => {
                resetReportPager(directionPager);
                applyReportFilters();
            });
        }
        if (directionSortDir) {
            directionSortDir.addEventListener('change', () => {
                resetReportPager(directionPager);
                applyReportFilters();
            });
        }
        if (groupSortBy) {
            groupSortBy.addEventListener('change', () => {
                resetReportPager(groupPager);
                applyReportFilters();
            });
        }
        if (groupSortDir) {
            groupSortDir.addEventListener('change', () => {
                resetReportPager(groupPager);
                applyReportFilters();
            });
        }

        bindTextDatePicker(fromInput, fromPickerBtn);
        bindTextDatePicker(toInput, toPickerBtn);

        loadReport();
    }
})();
