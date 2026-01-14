(function () {
    const api = async (url, options = {}) => {
        const config = {
            headers: {'Content-Type': 'application/json'},
            ...options
        };
        const response = await fetch(url, config);
        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || `Ошибка ${response.status}`);
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

    const safeValue = (value) => value === undefined || value === null ? '' : value;

    document.addEventListener('DOMContentLoaded', () => {
        initStudentsPage();
        initGroupsPage();
        initDirectionsPage();
        initCurriculumsPage();
        initOrdersPage();
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
        const filterCourse = document.getElementById('filterCourse');
        const filterStatus = document.getElementById('filterStatus');
        const filterSearch = document.getElementById('filterSearch');
        const resetBtn = document.getElementById('resetStudentFilters');
        const applyBtn = document.getElementById('applyStudentFilters');
        const pageSizeSelect = document.getElementById('pageSize');
        const pagePrev = document.getElementById('pagePrev');
        const pageNext = document.getElementById('pageNext');
        const paginationInfo = document.getElementById('paginationInfo');

        let currentPage = 0;
        let lastTotalPages = 1;

        let faculties = [];
        let directions = [];
        let groups = [];

        const loadFaculties = async () => {
            faculties = await api('/api/faculties');
            renderSelect(filterFaculty, faculties, 'Все');
            renderSelect(document.getElementById('studentFaculty'), faculties, 'Выберите факультет');
        };

        const loadDirections = async (facultyId) => {
            const url = facultyId ? `/api/directions?facultyId=${facultyId}` : '/api/directions';
            directions = await api(url);
            renderSelect(filterDirection, directions, 'Все');
            renderSelect(document.getElementById('studentDirection'), directions, 'Выберите направление');
        };

        const loadGroups = async (directionId) => {
            const url = directionId ? `/api/groups?directionId=${directionId}` : '/api/groups';
            groups = await api(url);
            renderSelect(filterGroup, groups, 'Все');
            renderSelect(document.getElementById('studentGroup'), groups, 'Выберите группу');
        };

        const loadStudents = async () => {
            const params = new URLSearchParams();
            if (filterFaculty.value) params.append('facultyId', filterFaculty.value);
            if (filterDirection.value) params.append('directionId', filterDirection.value);
            if (filterGroup.value) params.append('groupId', filterGroup.value);
            if (filterCourse.value) params.append('course', filterCourse.value);
            if (filterStatus.value) params.append('status', filterStatus.value);
            if (filterSearch.value) params.append('search', filterSearch.value);
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
                <td class="fw-semibold">${student.fullName}</td>
                <td>${student.recordBook || ''}</td>
                <td>${student.course}</td>
                <td><span class="badge text-bg-light">${safeValue(student.groupCode)}</span></td>
                <td>${safeValue(student.directionName)}</td>
                <td>${safeValue(student.facultyName)}</td>
                <td>${renderStatus(student.status)}</td>
                <td class="text-end table-actions">
                    <button class="btn-circle" data-action="edit"><i class="bi bi-pencil"></i></button>
                    <button class="btn-circle text-danger" data-action="delete"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        };

        const renderStatus = (status) => {
            const map = {
                ACTIVE: 'Обучается',
                ACADEMIC_LEAVE: 'Академ',
                EXPELLED: 'Отчислен',
                GRADUATED: 'Выпустился'
            };
            return `<span class="badge text-bg-light">${map[status] || status}</span>`;
        };

        const renderSelect = (selectEl, list, placeholder) => {
            if (!selectEl) return;
            const options = [`<option value="">${placeholder}</option>`]
                .concat(list.map(item => `<option value="${item.id}">${item.name || item.code}</option>`));
            selectEl.innerHTML = options.join('');
        };

        const renderPagination = (page, totalPages) => {
            lastTotalPages = totalPages || 0;
            const safeTotal = Math.max(totalPages || 0, 1);
            const displayPage = totalPages === 0 ? 0 : page + 1;
            paginationInfo.textContent = `Стр. ${displayPage} из ${safeTotal}`;
            pagePrev.disabled = page <= 0;
            pageNext.disabled = totalPages === 0 || page >= totalPages - 1;
        };

        const bindStudentActions = () => {
            document.querySelectorAll('#studentTableBody [data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', async (event) => {
                    const id = event.currentTarget.closest('tr').dataset.id;
                    const student = await api(`/api/students/${id}`);
                    fillStudentForm(student);
                    const modal = new bootstrap.Modal(document.getElementById('studentModal'));
                    modal.show();
                });
            });
            document.querySelectorAll('#studentTableBody [data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', async (event) => {
                    const id = event.currentTarget.closest('tr').dataset.id;
                    if (confirm('Удалить студента?')) {
                        await api(`/api/students/${id}`, {method: 'DELETE'});
                        toast('Студент удалён');
                        await loadStudents();
                    }
                });
            });
        };

        const fillStudentForm = (student) => {
            document.getElementById('studentModalTitle').textContent = 'Редактирование студента';
            document.getElementById('studentId').value = student.id;
            document.getElementById('lastName').value = safeValue(student.lastName);
            document.getElementById('firstName').value = safeValue(student.firstName);
            document.getElementById('middleName').value = safeValue(student.middleName);
            document.getElementById('recordBook').value = student.recordBook || '';
            document.getElementById('course').value = student.course;
            document.getElementById('status').value = student.status;
            document.getElementById('phone').value = safeValue(student.phone);
            document.getElementById('email').value = safeValue(student.email);
            document.getElementById('birthDate').value = student.birthDate || '';
            document.getElementById('enrollmentDate').value = student.enrollmentDate || '';
            document.getElementById('studentFaculty').value = faculties.find(f => f.name === student.facultyName)?.id || '';
            loadDirections(document.getElementById('studentFaculty').value).then(() => {
                document.getElementById('studentDirection').value = directions.find(d => d.name === student.directionName)?.id || '';
                loadGroups(document.getElementById('studentDirection').value).then(() => {
                    document.getElementById('studentGroup').value = student.groupId || '';
                });
            });
        };

        const resetStudentForm = () => {
            document.getElementById('studentModalTitle').textContent = 'Добавление студента';
            document.getElementById('studentForm').reset();
            document.getElementById('studentId').value = '';
        };

        document.getElementById('saveStudentBtn').addEventListener('click', async () => {
            const form = document.getElementById('studentForm');
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }
            const payload = {
                lastName: document.getElementById('lastName').value.trim(),
                firstName: document.getElementById('firstName').value.trim(),
                middleName: document.getElementById('middleName').value.trim(),
                recordBook: document.getElementById('recordBook').value.trim(),
                course: Number(document.getElementById('course').value),
                status: document.getElementById('status').value,
                groupId: Number(document.getElementById('studentGroup').value),
                phone: document.getElementById('phone').value,
                email: document.getElementById('email').value,
                birthDate: document.getElementById('birthDate').value || null,
                enrollmentDate: document.getElementById('enrollmentDate').value || null
            };
            const id = document.getElementById('studentId').value;
            const url = id ? `/api/students/${id}` : '/api/students';
            const method = id ? 'PUT' : 'POST';
            await api(url, {method, body: JSON.stringify(payload)});
            bootstrap.Modal.getInstance(document.getElementById('studentModal')).hide();
            toast('Студент сохранён');
            resetStudentForm();
            await loadStudents();
        });

        document.getElementById('studentModal').addEventListener('hidden.bs.modal', resetStudentForm);

        document.getElementById('studentFaculty').addEventListener('change', (e) => loadDirections(e.target.value));
        document.getElementById('studentDirection').addEventListener('change', (e) => loadGroups(e.target.value));
        filterFaculty.addEventListener('change', () => {
            currentPage = 0;
            loadDirections(filterFaculty.value).then(loadStudents);
        });
        filterDirection.addEventListener('change', () => {
            currentPage = 0;
            loadGroups(filterDirection.value).then(loadStudents);
        });
        filterGroup.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        filterCourse.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        filterStatus.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        applyBtn.addEventListener('click', () => {
            currentPage = 0;
            loadStudents();
        });
        pageSizeSelect.addEventListener('change', () => {
            currentPage = 0;
            loadStudents();
        });
        pagePrev.addEventListener('click', () => {
            if (currentPage > 0) {
                currentPage -= 1;
                loadStudents();
            }
        });
        pageNext.addEventListener('click', () => {
            if (currentPage < lastTotalPages - 1) {
                currentPage += 1;
                loadStudents();
            }
        });
        resetBtn.addEventListener('click', async () => {
            filterFaculty.value = '';
            filterDirection.value = '';
            filterGroup.value = '';
            filterCourse.value = '';
            filterStatus.value = '';
            filterSearch.value = '';
            currentPage = 0;
            await loadStudents();
        });

        (async () => {
            await loadFaculties();
            await loadDirections();
            await loadGroups();
            await loadStudents();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Группы =====
    function initGroupsPage() {
        const page = document.getElementById('groupsPage');
        if (!page) return;

        const table = document.getElementById('groupsTable');
        const facultyFilter = document.getElementById('groupFacultyFilter');
        const directionFilter = document.getElementById('groupDirectionFilter');

        let faculties = [];
        let directions = [];

        const loadFaculties = async () => {
            faculties = await api('/api/faculties');
            renderSelect(facultyFilter, faculties, 'Все');
            renderSelect(document.getElementById('groupDirectionSelect'), [], 'Выберите направление');
            renderSelect(document.getElementById('directionFaculty'), faculties, 'Факультет');
        };

        const loadDirections = async (facultyId) => {
            const url = facultyId ? `/api/directions?facultyId=${facultyId}` : '/api/directions';
            directions = await api(url);
            renderSelect(directionFilter, directions, 'Все');
            renderSelect(document.getElementById('groupDirectionSelect'), directions, 'Выберите направление');
        };

        const loadGroups = async () => {
            const params = directionFilter.value ? `?directionId=${directionFilter.value}` : '';
            const groups = await api('/api/groups' + params);
            table.innerHTML = groups.length === 0
                ? `<tr><td colspan="5" class="text-center text-muted py-4">Нет данных</td></tr>`
                : groups.map(group => `<tr data-id="${group.id}">
                    <td class="fw-semibold">${group.code}</td>
                    <td>${group.course}</td>
                    <td>${group.directionName || ''}</td>
                    <td>${group.facultyName || ''}</td>
                    <td class="text-end table-actions">
                        <button class="btn-circle" data-action="edit"><i class="bi bi-pencil"></i></button>
                        <button class="btn-circle text-danger" data-action="delete"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>`).join('');
            bindActions();
        };

        const renderSelect = (selectEl, list, placeholder) => {
            if (!selectEl) return;
            const opts = [`<option value="">${placeholder}</option>`]
                .concat(list.map(item => `<option value="${item.id}">${item.name || item.code}</option>`));
            selectEl.innerHTML = opts.join('');
        };

        const bindActions = () => {
            table.querySelectorAll('[data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const groups = await api(`/api/groups`);
                    const group = groups.find(g => g.id == id);
                    document.getElementById('groupModalTitle').textContent = 'Редактирование группы';
                    document.getElementById('groupId').value = id;
                    document.getElementById('groupCode').value = group.code;
                    document.getElementById('groupCourse').value = group.course;
                    document.getElementById('groupDirectionSelect').value = group.directionId;
                    new bootstrap.Modal(document.getElementById('groupModal')).show();
                });
            });
            table.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    if (confirm('Удалить группу?')) {
                        await api(`/api/groups/${id}`, {method: 'DELETE'});
                        toast('Группа удалена');
                        await loadGroups();
                    }
                });
            });
        };

        document.getElementById('saveGroupBtn').addEventListener('click', async () => {
            const form = document.getElementById('groupForm');
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }
            const payload = {
                code: document.getElementById('groupCode').value.trim(),
                course: Number(document.getElementById('groupCourse').value),
                directionId: Number(document.getElementById('groupDirectionSelect').value)
            };
            const id = document.getElementById('groupId').value;
            const url = id ? `/api/groups/${id}` : '/api/groups';
            const method = id ? 'PUT' : 'POST';
            await api(url, {method, body: JSON.stringify(payload)});
            bootstrap.Modal.getInstance(document.getElementById('groupModal')).hide();
            toast('Сохранено');
            form.reset();
            document.getElementById('groupId').value = '';
            await loadGroups();
        });

        document.getElementById('groupModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('groupForm').reset();
            document.getElementById('groupId').value = '';
            document.getElementById('groupModalTitle').textContent = 'Новая группа';
        });

        facultyFilter.addEventListener('change', () => loadDirections(facultyFilter.value).then(loadGroups));
        directionFilter.addEventListener('change', loadGroups);
        document.getElementById('reloadGroups').addEventListener('click', loadGroups);

        (async () => {
            await loadFaculties();
            await loadDirections();
            await loadGroups();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Направления и факультеты =====
    function initDirectionsPage() {
        const page = document.getElementById('directionsPage');
        if (!page) return;

        const directionsTable = document.getElementById('directionsTable');
        const facultiesTable = document.getElementById('facultiesTable');
        const facultyFilter = document.getElementById('directionFacultyFilter');

        let faculties = [];

        const loadFaculties = async () => {
            faculties = await api('/api/faculties');
            renderSelect(facultyFilter, faculties, 'Все');
            renderSelect(document.getElementById('directionFaculty'), faculties, 'Факультет');
            renderFaculties(faculties);
        };

        const renderFaculties = (list) => {
            facultiesTable.innerHTML = list.length === 0
                ? `<tr><td colspan="3" class="text-center text-muted py-4">Нет данных</td></tr>`
                : list.map(f => `<tr data-id="${f.id}">
                    <td class="fw-semibold">${f.code}</td>
                    <td>${f.name}</td>
                    <td class="text-end table-actions">
                        <button class="btn-circle" data-action="edit-faculty"><i class="bi bi-pencil"></i></button>
                        <button class="btn-circle text-danger" data-action="delete-faculty"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>`).join('');
            bindFacultyActions();
        };

        const renderDirections = (list) => {
            directionsTable.innerHTML = list.length === 0
                ? `<tr><td colspan="4" class="text-center text-muted py-4">Нет данных</td></tr>`
                : list.map(d => `<tr data-id="${d.id}">
                    <td class="fw-semibold">${d.code}</td>
                    <td>${d.name}</td>
                    <td>${d.facultyName || ''}</td>
                    <td class="text-end table-actions">
                        <button class="btn-circle" data-action="edit-direction"><i class="bi bi-pencil"></i></button>
                        <button class="btn-circle text-danger" data-action="delete-direction"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>`).join('');
            bindDirectionActions();
        };

        const loadDirections = async () => {
            const params = facultyFilter.value ? `?facultyId=${facultyFilter.value}` : '';
            const data = await api('/api/directions' + params);
            renderDirections(data);
        };

        const renderSelect = (selectEl, list, placeholder) => {
            if (!selectEl) return;
            const opts = [`<option value="">${placeholder}</option>`]
                .concat(list.map(item => `<option value="${item.id}">${item.name || item.code}</option>`));
            selectEl.innerHTML = opts.join('');
        };

        const bindFacultyActions = () => {
            facultiesTable.querySelectorAll('[data-action="edit-faculty"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const row = e.currentTarget.closest('tr');
                    const id = row.dataset.id;
                    const faculty = faculties.find(f => f.id == id);
                    document.getElementById('facultyModalTitle').textContent = 'Редактирование факультета';
                    document.getElementById('facultyId').value = faculty.id;
                    document.getElementById('facultyCode').value = faculty.code;
                    document.getElementById('facultyName').value = faculty.name;
                    new bootstrap.Modal(document.getElementById('facultyModal')).show();
                });
            });
            facultiesTable.querySelectorAll('[data-action="delete-faculty"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    if (confirm('Удалить факультет?')) {
                        await api(`/api/faculties/${id}`, {method: 'DELETE'});
                        toast('Факультет удалён');
                        await loadFaculties();
                        await loadDirections();
                    }
                });
            });
        };

        const bindDirectionActions = () => {
            directionsTable.querySelectorAll('[data-action="edit-direction"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const data = await api('/api/directions');
                    const direction = data.find(d => d.id == id);
                    document.getElementById('directionModalTitle').textContent = 'Редактирование направления';
                    document.getElementById('directionId').value = direction.id;
                    document.getElementById('directionCode').value = direction.code;
                    document.getElementById('directionName').value = direction.name;
                    document.getElementById('directionFaculty').value = direction.facultyId;
                    new bootstrap.Modal(document.getElementById('directionModal')).show();
                });
            });
            directionsTable.querySelectorAll('[data-action="delete-direction"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    if (confirm('Удалить направление?')) {
                        await api(`/api/directions/${id}`, {method: 'DELETE'});
                        toast('Направление удалено');
                        await loadDirections();
                    }
                });
            });
        };

        document.getElementById('saveFacultyBtn').addEventListener('click', async () => {
            const form = document.getElementById('facultyForm');
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }
            const payload = {
                code: document.getElementById('facultyCode').value.trim(),
                name: document.getElementById('facultyName').value.trim()
            };
            const id = document.getElementById('facultyId').value;
            const url = id ? `/api/faculties/${id}` : '/api/faculties';
            const method = id ? 'PUT' : 'POST';
            await api(url, {method, body: JSON.stringify(payload)});
            bootstrap.Modal.getInstance(document.getElementById('facultyModal')).hide();
            toast('Сохранено');
            form.reset();
            document.getElementById('facultyId').value = '';
            await loadFaculties();
            await loadDirections();
        });

        document.getElementById('saveDirectionBtn').addEventListener('click', async () => {
            const form = document.getElementById('directionForm');
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }
            const payload = {
                code: document.getElementById('directionCode').value.trim(),
                name: document.getElementById('directionName').value.trim(),
                facultyId: Number(document.getElementById('directionFaculty').value)
            };
            const id = document.getElementById('directionId').value;
            const url = id ? `/api/directions/${id}` : '/api/directions';
            const method = id ? 'PUT' : 'POST';
            await api(url, {method, body: JSON.stringify(payload)});
            bootstrap.Modal.getInstance(document.getElementById('directionModal')).hide();
            toast('Сохранено');
            form.reset();
            document.getElementById('directionId').value = '';
            await loadDirections();
        });

        document.getElementById('directionModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('directionForm').reset();
            document.getElementById('directionModalTitle').textContent = 'Новое направление';
        });
        document.getElementById('facultyModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('facultyForm').reset();
            document.getElementById('facultyModalTitle').textContent = 'Новый факультет';
        });

        facultyFilter.addEventListener('change', loadDirections);

        (async () => {
            await loadFaculties();
            await loadDirections();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Учебные планы (READ ONLY) =====
    function initCurriculumsPage() {
        const page = document.getElementById('curriculumsPage');
        if (!page) return;

        const directionSelect = document.getElementById('curriculumDirection');
        const table = document.getElementById('curriculumTable');
        const countEl = document.getElementById('curriculumCount');

        const loadDirections = async () => {
            const data = await api('/api/directions');
            directionSelect.innerHTML = `<option value="">Все</option>` + data.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        };

        const loadCurriculums = async () => {
            const params = directionSelect.value ? `?directionId=${directionSelect.value}` : '';
            const list = await api('/api/curriculums' + params);
            countEl.textContent = list.length;
            table.innerHTML = list.length === 0
                ? `<tr><td colspan="5" class="text-center text-muted py-4">Нет данных</td></tr>`
                : list.map(item => `<tr>
                    <td>${item.course}</td>
                    <td class="fw-semibold">${item.discipline}</td>
                    <td>${item.hours}</td>
                    <td>${item.attestation}</td>
                    <td>${item.directionName || ''}</td>
                </tr>`).join('');
        };

        directionSelect.addEventListener('change', loadCurriculums);

        (async () => {
            await loadDirections();
            await loadCurriculums();
        })().catch(err => toast(err.message, 'danger'));
    }

    // ===== Приказы =====
    function initOrdersPage() {
        const page = document.getElementById('ordersPage');
        if (!page) return;

        const table = document.getElementById('ordersTable');

        const loadOrders = async () => {
            const list = await api('/api/orders');
            table.innerHTML = list.length === 0
                ? `<tr><td colspan="5" class="text-center text-muted py-4">Нет приказов</td></tr>`
                : list.map(order => `<tr data-id="${order.id}">
                    <td class="fw-semibold">${order.number}</td>
                    <td>${order.orderDate}</td>
                    <td>${renderOrderType(order.type)}</td>
                    <td>${order.signerName || ''}</td>
                    <td class="text-end table-actions">
                        <a class="btn-circle" href="/orders/${order.id}/print" target="_blank"><i class="bi bi-printer"></i></a>
                        <button class="btn-circle" data-action="edit"><i class="bi bi-pencil"></i></button>
                        <button class="btn-circle text-danger" data-action="delete"><i class="bi bi-trash"></i></button>
                    </td>
                </tr>`).join('');
            bindActions(list);
        };

        const renderOrderType = (type) => {
            const map = {
                ACADEMIC_LEAVE: 'Академический отпуск',
                ENROLLMENT: 'Зачисление',
                EXPULSION: 'Отчисление',
                TRANSFER_DIRECTION: 'Перевод направления',
                TRANSFER_NEXT_COURSE: 'Перевод на курс'
            };
            return map[type] || type;
        };

        const bindActions = (list) => {
            table.querySelectorAll('[data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    const order = list.find(o => o.id == id);
                    fillOrderForm(order);
                    new bootstrap.Modal(document.getElementById('orderModal')).show();
                });
            });
            table.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.closest('tr').dataset.id;
                    if (confirm('Удалить приказ?')) {
                        await api(`/api/orders/${id}`, {method: 'DELETE'});
                        toast('Приказ удалён');
                        await loadOrders();
                    }
                });
            });
        };

        const fillOrderForm = (order) => {
            document.getElementById('orderModalTitle').textContent = 'Редактирование приказа';
            document.getElementById('orderId').value = order.id;
            document.getElementById('orderNumber').value = order.number;
            document.getElementById('orderDate').value = order.orderDate;
            document.getElementById('orderType').value = order.type;
            document.getElementById('signerName').value = safeValue(order.signerName);
            document.getElementById('signerPosition').value = safeValue(order.signerPosition);
            document.getElementById('signDate').value = order.signDate || '';
            document.getElementById('studentsList').value = safeValue(order.studentsList);
            document.getElementById('periodStart').value = order.periodStart || '';
            document.getElementById('periodEnd').value = order.periodEnd || '';
            document.getElementById('basis').value = safeValue(order.basis);
            document.getElementById('directionName').value = safeValue(order.directionName);
            document.getElementById('groupCode').value = safeValue(order.groupCode);
            document.getElementById('educationForm').value = safeValue(order.educationForm);
            document.getElementById('educationBase').value = safeValue(order.educationBase);
            document.getElementById('contractInfo').value = safeValue(order.contractInfo);
            document.getElementById('oldGroup').value = safeValue(order.oldGroup);
            document.getElementById('newGroup').value = safeValue(order.newGroup);
            document.getElementById('oldDirection').value = safeValue(order.oldDirection);
            document.getElementById('newDirection').value = safeValue(order.newDirection);
            document.getElementById('previousCourse').value = safeValue(order.previousCourse);
            document.getElementById('nextCourse').value = safeValue(order.nextCourse);
            document.getElementById('expelDate').value = order.expelDate || '';
            document.getElementById('costInfo').value = safeValue(order.costInfo);
        };

        const resetOrderForm = () => {
            document.getElementById('orderForm').reset();
            document.getElementById('orderModalTitle').textContent = 'Новый приказ';
            document.getElementById('orderId').value = '';
        };

        document.getElementById('saveOrderBtn').addEventListener('click', async () => {
            const form = document.getElementById('orderForm');
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }
            const payload = {
                number: document.getElementById('orderNumber').value.trim(),
                orderDate: document.getElementById('orderDate').value,
                type: document.getElementById('orderType').value,
                signerName: document.getElementById('signerName').value,
                signerPosition: document.getElementById('signerPosition').value,
                signDate: document.getElementById('signDate').value || null,
                studentsList: document.getElementById('studentsList').value,
                periodStart: document.getElementById('periodStart').value || null,
                periodEnd: document.getElementById('periodEnd').value || null,
                basis: document.getElementById('basis').value,
                directionName: document.getElementById('directionName').value,
                groupCode: document.getElementById('groupCode').value,
                educationForm: document.getElementById('educationForm').value,
                educationBase: document.getElementById('educationBase').value,
                costInfo: document.getElementById('costInfo').value,
                expelDate: document.getElementById('expelDate').value || null,
                contractInfo: document.getElementById('contractInfo').value,
                oldDirection: document.getElementById('oldDirection').value,
                oldGroup: document.getElementById('oldGroup').value,
                newDirection: document.getElementById('newDirection').value,
                newGroup: document.getElementById('newGroup').value,
                previousCourse: document.getElementById('previousCourse').value ? Number(document.getElementById('previousCourse').value) : null,
                nextCourse: document.getElementById('nextCourse').value ? Number(document.getElementById('nextCourse').value) : null
            };
            const id = document.getElementById('orderId').value;
            const url = id ? `/api/orders/${id}` : '/api/orders';
            const method = id ? 'PUT' : 'POST';
            await api(url, {method, body: JSON.stringify(payload)});
            bootstrap.Modal.getInstance(document.getElementById('orderModal')).hide();
            toast('Приказ сохранён');
            resetOrderForm();
            await loadOrders();
        });

        document.getElementById('orderModal').addEventListener('hidden.bs.modal', resetOrderForm);

        loadOrders().catch(err => toast(err.message, 'danger'));
    }

    // ===== Отчёты =====
    function initReportsPage() {
        const page = document.getElementById('reportsPage');
        if (!page) return;

        const fromInput = document.getElementById('reportFrom');
        const toInput = document.getElementById('reportTo');
        const applyBtn = document.getElementById('applyReportFilters');
        const resetBtn = document.getElementById('resetReportFilters');
        const facultyBody = document.getElementById('facultyReportBody');
        const directionBody = document.getElementById('directionReportBody');
        const groupBody = document.getElementById('groupReportBody');

        const totalEl = document.getElementById('reportTotal');
        const activeEl = document.getElementById('reportActive');
        const academicEl = document.getElementById('reportAcademic');
        const expelledEl = document.getElementById('reportExpelled');
        const graduatedEl = document.getElementById('reportGraduated');
        const facultyCount = document.getElementById('facultyCount');
        const directionCount = document.getElementById('directionCount');
        const groupCount = document.getElementById('groupCount');

        const formatNumber = (value) => typeof value === 'number' ? value.toLocaleString('ru-RU') : '—';

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

        const renderTable = (tbody, rows, renderRow) => {
            if (!rows || rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${tbody.id === 'groupReportBody' ? 8 : tbody.id === 'directionReportBody' ? 7 : 6}" class="text-center text-muted py-3">Нет данных за выбранный период</td></tr>`;
                return;
            }
            tbody.innerHTML = rows.map(renderRow).join('');
        };

        const rowCells = (row) => `
            <td class="text-end fw-semibold">${formatNumber(row.total)}</td>
            <td class="text-end">${formatNumber(row.active)}</td>
            <td class="text-end">${formatNumber(row.academicLeave)}</td>
            <td class="text-end">${formatNumber(row.expelled)}</td>
            <td class="text-end">${formatNumber(row.graduated)}</td>
        `;

        const loadReport = async () => {
            applyBtn.disabled = true;
            applyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Загрузка...';
            try {
                const params = new URLSearchParams();
                if (fromInput.value) params.append('from', fromInput.value);
                if (toInput.value) params.append('to', toInput.value);
                const url = params.toString() ? `/api/reports/contingent?${params.toString()}` : '/api/reports/contingent';
                const data = await api(url);

                facultyCount.textContent = data.faculties.length;
                directionCount.textContent = data.directions.length;
                groupCount.textContent = data.groups.length;

                renderSummary(data);

                renderTable(facultyBody, data.faculties, (row) => `
                    <tr>
                        <td>${safeValue(row.facultyName)}</td>
                        ${rowCells(row)}
                    </tr>
                `);

                renderTable(directionBody, data.directions, (row) => `
                    <tr>
                        <td>${safeValue(row.facultyName)}</td>
                        <td>${safeValue(row.directionName)}</td>
                        ${rowCells(row)}
                    </tr>
                `);

                renderTable(groupBody, data.groups, (row) => `
                    <tr>
                        <td>${safeValue(row.facultyName)}</td>
                        <td>${safeValue(row.directionName)}</td>
                        <td><span class="badge text-bg-light">${safeValue(row.groupCode)}</span></td>
                        ${rowCells(row)}
                    </tr>
                `);
            } catch (err) {
                toast(`Не удалось построить отчёт: ${err.message}`, 'danger');
            } finally {
                applyBtn.disabled = false;
                applyBtn.innerHTML = '<i class="bi bi-graph-up me-1"></i>Построить отчёт';
            }
        };

        applyBtn.addEventListener('click', loadReport);
        resetBtn.addEventListener('click', () => {
            fromInput.value = '';
            toInput.value = '';
            loadReport();
        });

        loadReport();
    }
})();
