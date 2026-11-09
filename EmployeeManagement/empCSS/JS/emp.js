const STORAGE_KEYS = {
    employees: 'employeeManager.employees',
    attendance: 'employeeManager.attendance',
    payroll: 'employeeManager.payroll',
    admins: 'employeeManager.admins',
    leave: 'employeeManager.leave',
    courses: 'employeeManager.courses',
    settings: 'employeeManager.settings'
};
const ADMIN_AUTH_KEY = 'employeeManager.adminAuth';
const ADMIN_SESSION_KEY = 'employeeManager.adminSession';
const PASSWORD_ITERATIONS = 310000;

const pageTitles = {
    dashboard: 'Dashboard',
    employees: 'Employees',
    attendance: 'Attendance',
    payroll: 'Payroll',
    reports: 'Reports',
    admin: 'Admin',
    hr: 'HR',
    courses: 'Courses',
    settings: 'Settings'
};

const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'JPY'];

function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEYS.settings);
    if (!saved) return { organization: 'Employee Management', adminName: 'Admin', adminEmail: '', currency: 'USD' };
    const value = JSON.parse(saved);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Saved workspace settings are invalid.');
    }
    return {
        organization: String(value.organization || 'Employee Management'),
        adminName: String(value.adminName || 'Admin'),
        adminEmail: String(value.adminEmail || ''),
        currency: supportedCurrencies.includes(value.currency) ? value.currency : 'USD'
    };
}

let settings = loadSettings();
let currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency });

function loadCollection(key) {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    let value;
    try {
        value = JSON.parse(saved);
    } catch (error) {
        throw new Error(`${key.replace('employeeManager.', '')} data is not valid JSON.`, { cause: error });
    }
    if (!Array.isArray(value)) throw new Error(`${key.replace('employeeManager.', '')} data is not a valid list.`);
    if (value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error(`${key.replace('employeeManager.', '')} data contains an invalid record.`);
    }
    return value;
}

function reloadSavedData(showSuccess = false) {
    let nextData;
    try {
        nextData = {
            employees: loadCollection(STORAGE_KEYS.employees),
            attendance: loadCollection(STORAGE_KEYS.attendance),
            payroll: loadCollection(STORAGE_KEYS.payroll),
            admins: loadCollection(STORAGE_KEYS.admins),
            leave: loadCollection(STORAGE_KEYS.leave),
            courses: loadCollection(STORAGE_KEYS.courses),
            settings: loadSettings()
        };
    } catch (error) {
        console.error('Unable to read saved dashboard data.', error);
        showNotice(`Could not read saved dashboard data: ${error.message}`, true);
        return false;
    }

    employees = nextData.employees;
    attendanceRecords = nextData.attendance;
    payrollRecords = nextData.payroll;
    admins = nextData.admins;
    leaveRequests = nextData.leave;
    courses = nextData.courses;
    settings = nextData.settings;
    currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency });

    try {
        renderAll();
    } catch (error) {
        console.error('Saved dashboard data was read, but could not be displayed.', error);
        showNotice(`Dashboard records loaded, but could not be displayed: ${error.message}`, true);
        return false;
    }

    if (showSuccess) showNotice(`Dashboard refreshed: ${employees.length} employee${employees.length === 1 ? '' : 's'}, ${attendanceRecords.length} attendance record${attendanceRecords.length === 1 ? '' : 's'}, and ${payrollRecords.length} payroll record${payrollRecords.length === 1 ? '' : 's'}.`);
    return true;
}

let employees = loadCollection(STORAGE_KEYS.employees);
let attendanceRecords = loadCollection(STORAGE_KEYS.attendance);
let payrollRecords = loadCollection(STORAGE_KEYS.payroll);
let admins = loadCollection(STORAGE_KEYS.admins);
let leaveRequests = loadCollection(STORAGE_KEYS.leave);
let courses = loadCollection(STORAGE_KEYS.courses);
let departmentChart;
let attendanceChart;
let reportRows = [];
let reportColumns = [];
let activeReport;
let noticeTimer;
let adminAccount;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function createId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function derivePasswordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
        throw new Error('Secure password hashing is unavailable. Open this page in a modern browser using localhost.');
    }

    const key = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
    }, key, 256);
    return bytesToHex(new Uint8Array(bits));
}

function showAuthNotice(message, isError = true) {
    const notice = document.getElementById('authNotice');
    notice.textContent = message;
    notice.classList.toggle('success', !isError);
    notice.hidden = false;
}

function setAuthView(view) {
    const isSetup = view === 'setup';
    document.getElementById('setupForm').hidden = !isSetup;
    document.getElementById('loginForm').hidden = isSetup;
    document.getElementById('authTitle').textContent = isSetup ? 'Set up your admin account' : 'Welcome back';
    document.getElementById('authDescription').textContent = isSetup
        ? 'Create the first administrator to protect this browser-based workspace.'
        : 'Sign in with the administrator account for this browser.';
    document.getElementById('authNotice').hidden = true;
}

function enterDashboard() {
    document.getElementById('authScreen').hidden = true;
    document.getElementById('dashboardApp').hidden = false;
    document.querySelectorAll('.page-view').forEach(view => { view.hidden = view.id !== 'view-dashboard'; });
    document.querySelectorAll('.nav-item').forEach(link => { link.classList.toggle('active', link.dataset.view === 'dashboard'); });
    document.getElementById('pageTitle').textContent = pageTitles.dashboard;
    reloadSavedData();
    updateNetPayPreview();
}

function initializeAuth() {
    document.getElementById('authOrganization').textContent = settings.organization;
    let savedAccount;
    try {
        const saved = localStorage.getItem(ADMIN_AUTH_KEY);
        savedAccount = saved ? JSON.parse(saved) : null;
        if (savedAccount && (
            typeof savedAccount.email !== 'string' ||
            typeof savedAccount.name !== 'string' ||
            typeof savedAccount.salt !== 'string' ||
            typeof savedAccount.passwordHash !== 'string' ||
            !Number.isInteger(savedAccount.iterations) ||
            savedAccount.iterations < 100000 ||
            savedAccount.iterations > 1000000
        )) {
            throw new Error('The saved admin account has an invalid format.');
        }
    } catch (error) {
        console.error('Unable to read the saved admin account.', error);
        showAuthNotice('The saved admin account could not be read. Browser storage may be damaged or unavailable.');
        return;
    }

    adminAccount = savedAccount;
    if (!adminAccount) {
        setAuthView('setup');
        return;
    }

    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === adminAccount.email) {
        enterDashboard();
        return;
    }
    setAuthView('login');
}

async function handleSetupSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const email = data.email.trim().toLowerCase();
    if (data.password !== data.confirmPassword) {
        showAuthNotice('The passwords do not match.');
        return;
    }

    try {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const account = {
            name: data.name.trim(),
            email,
            salt: bytesToHex(salt),
            iterations: PASSWORD_ITERATIONS,
            passwordHash: await derivePasswordHash(data.password, salt, PASSWORD_ITERATIONS)
        };
        const nextSettings = {
            ...settings,
            adminName: account.name,
            adminEmail: account.email
        };
        localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(account));
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(nextSettings));
        adminAccount = account;
        settings = nextSettings;
        document.getElementById('authOrganization').textContent = settings.organization;
        form.reset();
        setAuthView('login');
        document.getElementById('loginForm').elements.email.value = account.email;
        showAuthNotice('Admin account created. Sign in to open the dashboard.', false);
    } catch (error) {
        console.error('Unable to create the admin account.', error);
        showAuthNotice(error.message || 'Could not save the admin account. Check browser storage and try again.');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const email = data.email.trim().toLowerCase();
    if (email !== adminAccount.email) {
        showAuthNotice('The email or password is incorrect.');
        return;
    }

    try {
        const salt = new Uint8Array(adminAccount.salt.match(/.{2}/g).map(byte => Number.parseInt(byte, 16)));
        const candidateHash = await derivePasswordHash(data.password, salt, adminAccount.iterations);
        if (candidateHash !== adminAccount.passwordHash) {
            showAuthNotice('The email or password is incorrect.');
            return;
        }
        sessionStorage.setItem(ADMIN_SESSION_KEY, adminAccount.email);
        form.reset();
        enterDashboard();
    } catch (error) {
        console.error('Unable to verify the admin account.', error);
        showAuthNotice(error.message || 'Could not verify the account. Check browser storage and try again.');
    }
}

function showNotice(message, isError = false) {
    const notice = document.getElementById('notice');
    notice.textContent = message;
    notice.classList.toggle('error', isError);
    notice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 5000);
}

function commitCollection(collection, nextValue, successMessage) {
    try {
        localStorage.setItem(STORAGE_KEYS[collection], JSON.stringify(nextValue));
    } catch (error) {
        console.error('Unable to save application data.', error);
        showNotice('Could not save your changes in this browser. Check available storage and try again.', true);
        return false;
    }

    if (collection === 'employees') employees = nextValue;
    if (collection === 'attendance') attendanceRecords = nextValue;
    if (collection === 'payroll') payrollRecords = nextValue;
    if (collection === 'admins') admins = nextValue;
    if (collection === 'leave') leaveRequests = nextValue;
    if (collection === 'courses') courses = nextValue;
    renderAll();
    showNotice(successMessage);
    return true;
}

function employeeName(employeeId, savedName = '') {
    const employee = employees.find(item => item.id === employeeId);
    return employee ? employee.name : savedName || 'Employee no longer available';
}

function emptyRow(columns, message) {
    return `<tr><td class="empty-row" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function statusClass(status) {
    return `status-${String(status).toLowerCase().replace(/\s+/g, '-')}`;
}

function fillEmployeeOptions() {
    const options = employees
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(employee => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} — ${escapeHtml(employee.department)}</option>`)
        .join('');

    ['attendanceForm', 'payrollForm', 'leaveForm', 'courseForm'].forEach(formId => {
        const select = document.querySelector(`#${formId} select[name="employeeId"]`);
        const selected = select.value;
        select.innerHTML = `<option value="">Select an employee</option>${options}`;
        if (employees.some(employee => employee.id === selected)) select.value = selected;
    });
}

function renderWorkspaceProfile() {
    document.querySelector('.eyebrow').textContent = settings.organization.toUpperCase();
    document.querySelector('.user-menu > span:last-child').textContent = settings.adminName;
    document.querySelector('.user-avatar').textContent = settings.adminName.trim().charAt(0).toUpperCase() || 'A';
}

function renderEmployees() {
    const body = document.getElementById('employeesTable');
    document.getElementById('employeeCount').textContent = `${employees.length} employee${employees.length === 1 ? '' : 's'}`;

    if (!employees.length) {
        body.innerHTML = emptyRow(6, 'No employees yet. Add an employee using the form above.');
        return;
    }

    body.innerHTML = employees
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(employee => `
            <tr data-search="${escapeHtml(`${employee.name} ${employee.department} ${employee.position} ${employee.email} ${employee.phone}`.toLowerCase())}">
                <td><div class="person-cell"><strong>${escapeHtml(employee.name)}</strong><span>${escapeHtml(employee.phone || 'No phone')}</span></div></td>
                <td>${escapeHtml(employee.department)}</td>
                <td>${escapeHtml(employee.position)}</td>
                <td>${escapeHtml(employee.email)}</td>
                <td>${currency.format(Number(employee.salary) || 0)}</td>
                <td><div class="row-actions"><button class="button button-secondary button-small" type="button" data-action="edit-employee" data-id="${escapeHtml(employee.id)}">Edit</button><button class="button button-danger button-small" type="button" data-action="delete-employee" data-id="${escapeHtml(employee.id)}">Delete</button></div></td>
            </tr>
        `).join('');
}

function renderAttendance() {
    const body = document.getElementById('attendanceTable');
    document.getElementById('attendanceCount').textContent = `${attendanceRecords.length} record${attendanceRecords.length === 1 ? '' : 's'}`;

    if (!attendanceRecords.length) {
        body.innerHTML = emptyRow(6, 'No attendance has been recorded yet.');
        return;
    }

    body.innerHTML = attendanceRecords
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || employeeName(a.employeeId, a.employeeName).localeCompare(employeeName(b.employeeId, b.employeeName)))
        .map(record => {
            const name = employeeName(record.employeeId, record.employeeName);
            return `
                <tr data-search="${escapeHtml(`${name} ${record.date} ${record.status}`.toLowerCase())}">
                    <td>${escapeHtml(name)}</td>
                    <td>${escapeHtml(record.date)}</td>
                    <td><span class="status ${statusClass(record.status)}">${escapeHtml(record.status)}</span></td>
                    <td>${escapeHtml(record.checkIn || '—')}</td>
                    <td>${escapeHtml(record.checkOut || '—')}</td>
                    <td><div class="row-actions"><button class="button button-secondary button-small" type="button" data-action="edit-attendance" data-id="${escapeHtml(record.id)}">Edit</button><button class="button button-danger button-small" type="button" data-action="delete-attendance" data-id="${escapeHtml(record.id)}">Delete</button></div></td>
                </tr>
            `;
        }).join('');
}

function renderPayroll() {
    const body = document.getElementById('payrollTable');
    document.getElementById('payrollCount').textContent = `${payrollRecords.length} record${payrollRecords.length === 1 ? '' : 's'}`;

    if (!payrollRecords.length) {
        body.innerHTML = emptyRow(8, 'No payroll records yet. Create a record using the form above.');
        return;
    }

    body.innerHTML = payrollRecords
        .slice()
        .sort((a, b) => b.period.localeCompare(a.period) || employeeName(a.employeeId, a.employeeName).localeCompare(employeeName(b.employeeId, b.employeeName)))
        .map(record => {
            const name = employeeName(record.employeeId, record.employeeName);
            const netPay = Number(record.baseSalary) + Number(record.overtime) + Number(record.bonus) - Number(record.deductions);
            return `
                <tr data-search="${escapeHtml(`${name} ${record.period}`.toLowerCase())}">
                    <td>${escapeHtml(name)}</td>
                    <td>${escapeHtml(record.period)}</td>
                    <td>${currency.format(Number(record.baseSalary))}</td>
                    <td>${currency.format(Number(record.overtime))}</td>
                    <td>${currency.format(Number(record.bonus))}</td>
                    <td>${currency.format(Number(record.deductions))}</td>
                    <td><strong>${currency.format(netPay)}</strong></td>
                    <td><div class="row-actions"><button class="button button-secondary button-small" type="button" data-action="edit-payroll" data-id="${escapeHtml(record.id)}">Edit</button><button class="button button-danger button-small" type="button" data-action="delete-payroll" data-id="${escapeHtml(record.id)}">Delete</button></div></td>
                </tr>
            `;
        }).join('');
}

function renderAdmins() {
    const body = document.getElementById('adminTable');
    document.getElementById('adminCount').textContent = `${admins.length} administrator${admins.length === 1 ? '' : 's'}`;
    if (!admins.length) {
        body.innerHTML = emptyRow(5, 'No administrator directory entries yet.');
        return;
    }

    body.innerHTML = admins
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(admin => `
            <tr data-search="${escapeHtml(`${admin.name} ${admin.email} ${admin.role} ${admin.status}`.toLowerCase())}">
                <td>${escapeHtml(admin.name)}</td>
                <td>${escapeHtml(admin.email)}</td>
                <td>${escapeHtml(admin.role)}</td>
                <td><span class="status ${admin.status === 'Active' ? 'status-active' : 'status-inactive'}">${escapeHtml(admin.status)}</span></td>
                <td><div class="row-actions"><button class="button button-secondary button-small" type="button" data-action="edit-admin" data-id="${escapeHtml(admin.id)}">Edit</button><button class="button button-danger button-small" type="button" data-action="delete-admin" data-id="${escapeHtml(admin.id)}">Delete</button></div></td>
            </tr>
        `).join('');
}

function renderLeaveRequests() {
    const body = document.getElementById('leaveTable');
    document.getElementById('leaveCount').textContent = `${leaveRequests.length} request${leaveRequests.length === 1 ? '' : 's'}`;
    if (!leaveRequests.length) {
        body.innerHTML = emptyRow(6, 'No leave requests have been submitted.');
        return;
    }

    body.innerHTML = leaveRequests
        .slice()
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map(request => {
            const name = employeeName(request.employeeId, request.employeeName);
            const actions = request.status === 'Pending'
                ? `<button class="button button-primary button-small" type="button" data-action="approve-leave" data-id="${escapeHtml(request.id)}">Approve</button><button class="button button-secondary button-small" type="button" data-action="decline-leave" data-id="${escapeHtml(request.id)}">Decline</button>`
                : '';
            return `
                <tr data-search="${escapeHtml(`${name} ${request.type} ${request.startDate} ${request.endDate} ${request.status} ${request.reason}`.toLowerCase())}">
                    <td>${escapeHtml(name)}</td>
                    <td>${escapeHtml(request.type)}</td>
                    <td>${escapeHtml(request.startDate)} – ${escapeHtml(request.endDate)}</td>
                    <td>${escapeHtml(request.reason || '—')}</td>
                    <td><span class="status ${statusClass(request.status)}">${escapeHtml(request.status)}</span></td>
                    <td><div class="row-actions">${actions}<button class="button button-secondary button-small" type="button" data-action="edit-leave" data-id="${escapeHtml(request.id)}">Edit</button><button class="button button-danger button-small" type="button" data-action="delete-leave" data-id="${escapeHtml(request.id)}">Delete</button></div></td>
                </tr>
            `;
        }).join('');
}

function renderCourses() {
    const body = document.getElementById('courseTable');
    document.getElementById('courseCount').textContent = `${courses.length} course${courses.length === 1 ? '' : 's'}`;
    if (!courses.length) {
        body.innerHTML = emptyRow(7, 'No course assignments yet. Assign an employee a course using the form above.');
        return;
    }

    body.innerHTML = courses
        .slice()
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map(course => {
            const name = employeeName(course.employeeId, course.employeeName);
            return `
                <tr data-search="${escapeHtml(`${name} ${course.title} ${course.provider} ${course.status} ${course.startDate}`.toLowerCase())}">
                    <td>${escapeHtml(name)}</td>
                    <td>${escapeHtml(course.title)}</td>
                    <td>${escapeHtml(course.provider || '—')}</td>
                    <td>${escapeHtml(course.startDate)}</td>
                    <td>${currency.format(Number(course.cost) || 0)}</td>
                    <td><span class="status ${statusClass(course.status)}">${escapeHtml(course.status)}</span></td>
                    <td><div class="row-actions"><button class="button button-secondary button-small" type="button" data-action="edit-course" data-id="${escapeHtml(course.id)}">Edit</button><button class="button button-danger button-small" type="button" data-action="delete-course" data-id="${escapeHtml(course.id)}">Delete</button></div></td>
                </tr>
            `;
        }).join('');
}

function renderDashboard() {
    const today = localDateString();
    const todaysRecords = attendanceRecords.filter(record => record.date === today);
    document.getElementById('totalEmployees').textContent = employees.length;
    document.getElementById('presentToday').textContent = todaysRecords.filter(record => record.status === 'Present' || record.status === 'Late').length;
    document.getElementById('onLeave').textContent = todaysRecords.filter(record => record.status === 'On leave').length;

    const latestPeriod = payrollRecords.reduce((latest, record) => record.period > latest ? record.period : latest, '');
    const latestTotal = payrollRecords
        .filter(record => record.period === latestPeriod)
        .reduce((sum, record) => sum + Number(record.baseSalary) + Number(record.overtime) + Number(record.bonus) - Number(record.deductions), 0);
    document.getElementById('latestPayroll').textContent = latestPeriod ? currency.format(latestTotal) : '—';

    const recent = attendanceRecords.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    document.getElementById('recentAttendance').innerHTML = recent.length
        ? recent.map(record => `
            <tr data-search="${escapeHtml(`${employeeName(record.employeeId, record.employeeName)} ${record.date} ${record.status}`.toLowerCase())}">
                <td>${escapeHtml(employeeName(record.employeeId, record.employeeName))}</td>
                <td>${escapeHtml(record.date)}</td>
                <td><span class="status ${statusClass(record.status)}">${escapeHtml(record.status)}</span></td>
                <td>${escapeHtml(record.checkIn || '—')}${record.checkOut ? ` – ${escapeHtml(record.checkOut)}` : ''}</td>
            </tr>
        `).join('')
        : emptyRow(4, 'No attendance recorded yet.');

    renderCharts();
}

function renderCharts() {
    const departmentCanvas = document.getElementById('departmentChart');
    const attendanceCanvas = document.getElementById('attendanceChart');
    const departmentEmpty = document.getElementById('departmentEmpty');
    const attendanceEmpty = document.getElementById('attendanceEmpty');
    const departmentCounts = employees.reduce((counts, employee) => {
        counts[employee.department] = (counts[employee.department] || 0) + 1;
        return counts;
    }, {});
    const departmentLabels = Object.keys(departmentCounts);

    departmentCanvas.hidden = departmentLabels.length === 0;
    departmentEmpty.hidden = departmentLabels.length > 0;
    attendanceCanvas.hidden = attendanceRecords.length === 0;
    attendanceEmpty.hidden = attendanceRecords.length > 0;

    if (typeof Chart === 'undefined') return;

    if (departmentChart) departmentChart.destroy();
    if (departmentLabels.length) {
        departmentChart = new Chart(departmentCanvas, {
            type: 'doughnut',
            data: {
                labels: departmentLabels,
                datasets: [{ data: departmentLabels.map(label => departmentCounts[label]), backgroundColor: ['#4361ee', '#20a779', '#f2a43a', '#8b5bd5', '#e36c83', '#39a8b7'], borderWidth: 2, borderColor: '#fff' }]
            },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    if (attendanceChart) attendanceChart.destroy();
    if (attendanceRecords.length) {
        const days = Array.from({ length: 7 }, (_, index) => {
            const day = new Date();
            day.setHours(12, 0, 0, 0);
            day.setDate(day.getDate() - (6 - index));
            return localDateString(day);
        });
        const present = days.map(day => attendanceRecords.filter(record => record.date === day && (record.status === 'Present' || record.status === 'Late')).length);
        const absent = days.map(day => attendanceRecords.filter(record => record.date === day && record.status === 'Absent').length);
        attendanceChart = new Chart(attendanceCanvas, {
            type: 'line',
            data: {
                labels: days.map(day => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })),
                datasets: [
                    { label: 'Present / late', data: present, borderColor: '#20a779', backgroundColor: '#20a77920', tension: .35, fill: true },
                    { label: 'Absent', data: absent, borderColor: '#e36c6c', backgroundColor: '#e36c6c18', tension: .35, fill: true }
                ]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

function renderAll() {
    fillEmployeeOptions();
    renderEmployees();
    renderAttendance();
    renderPayroll();
    renderAdmins();
    renderLeaveRequests();
    renderCourses();
    renderWorkspaceProfile();
    renderDashboard();
    if (activeReport) setReport(activeReport.type, activeReport.from, activeReport.to);
    applySearch();
}

function resetForm(formId) {
    const form = document.getElementById(formId);
    form.reset();
    form.elements.id.value = '';
    const cancelButton = form.querySelector('[data-reset]');
    if (cancelButton) cancelButton.hidden = true;

    const defaults = {
        employeeForm: { title: 'Add employee', submit: '<i class="fas fa-user-plus"></i> Save employee' },
        attendanceForm: { title: 'Record attendance', submit: '<i class="fas fa-check"></i> Save attendance' },
        payrollForm: { title: 'Create payroll record', submit: '<i class="fas fa-calculator"></i> Save payroll' },
        adminForm: { title: 'Add administrator', submit: '<i class="fas fa-user-plus"></i> Save administrator' },
        leaveForm: { title: 'Create leave request', submit: '<i class="fas fa-calendar-plus"></i> Save request' },
        courseForm: { title: 'Assign a course', submit: '<i class="fas fa-graduation-cap"></i> Save course' }
    };
    const settings = defaults[formId];
    document.getElementById(formId.replace('Form', 'FormTitle')).textContent = settings.title;
    document.getElementById(formId.replace('Form', 'Submit')).innerHTML = settings.submit;
    if (formId === 'attendanceForm') form.elements.date.value = localDateString();
    if (formId === 'leaveForm') {
        form.elements.startDate.value = localDateString();
        form.elements.endDate.value = localDateString();
    }
    if (formId === 'courseForm') form.elements.startDate.value = localDateString();
    if (formId === 'payrollForm') {
        form.elements.baseSalary.value = '';
        form.elements.period.value = localDateString().slice(0, 7);
        form.elements.overtime.value = '0';
        form.elements.bonus.value = '0';
        form.elements.deductions.value = '0';
        updateNetPayPreview();
    }
}

function beginEdit(formId, record, title, buttonText) {
    const form = document.getElementById(formId);
    Object.entries(record).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = value;
    });
    form.querySelector('[data-reset]').hidden = false;
    document.getElementById(`${formId.replace('Form', 'Form')}Title`).textContent = title;
    document.getElementById(`${formId.replace('Form', 'Submit')}`).innerHTML = `<i class="fas fa-save"></i> ${buttonText}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleEmployeeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    data.name = data.name.trim();
    data.email = data.email.trim().toLowerCase();
    data.department = data.department.trim();
    data.position = data.position.trim();
    data.phone = data.phone.trim();
    data.salary = Number(data.salary);

    if (employees.some(employee => employee.email.toLowerCase() === data.email && employee.id !== data.id)) {
        showNotice('An employee with this email address already exists.', true);
        return;
    }

    const editing = Boolean(data.id);
    const updated = editing
        ? employees.map(employee => employee.id === data.id ? { ...employee, ...data } : employee)
        : [...employees, { ...data, id: createId() }];
    if (commitCollection('employees', updated, editing ? 'Employee updated.' : 'Employee added.')) resetForm('employeeForm');
}

function handleAttendanceSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (data.checkIn && data.checkOut && data.checkOut < data.checkIn) {
        showNotice('Check-out time must be later than check-in time.', true);
        return;
    }
    data.employeeName = employeeName(data.employeeId);

    const duplicate = attendanceRecords.find(record =>
        record.employeeId === data.employeeId &&
        record.date === data.date &&
        record.id !== data.id
    );
    const editing = Boolean(data.id);
    let updated;
    if (duplicate) {
        updated = attendanceRecords.map(record => record.id === duplicate.id ? { ...record, ...data } : record);
        updated = updated.filter(record => record.id !== data.id);
    } else if (editing) {
        updated = attendanceRecords.map(record => record.id === data.id ? { ...record, ...data } : record);
    } else {
        updated = [...attendanceRecords, { ...data, id: createId() }];
    }
    if (commitCollection('attendance', updated, duplicate ? 'Attendance for that employee and date was updated.' : editing ? 'Attendance record updated.' : 'Attendance recorded.')) resetForm('attendanceForm');
}

function numericValue(value) {
    return value === '' ? 0 : Number(value);
}

function updateNetPayPreview() {
    const form = document.getElementById('payrollForm');
    if (!form) return;
    const total = numericValue(form.elements.baseSalary.value)
        + numericValue(form.elements.overtime.value)
        + numericValue(form.elements.bonus.value)
        - numericValue(form.elements.deductions.value);
    document.getElementById('netPayPreview').textContent = currency.format(total);
}

function handlePayrollSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    data.employeeName = employeeName(data.employeeId);
    ['baseSalary', 'overtime', 'bonus', 'deductions'].forEach(field => { data[field] = numericValue(data[field]); });
    const duplicate = payrollRecords.find(record =>
        record.employeeId === data.employeeId &&
        record.period === data.period &&
        record.id !== data.id
    );
    if (duplicate) {
        showNotice('A payroll record already exists for this employee and pay period. Edit that record instead.', true);
        return;
    }

    const editing = Boolean(data.id);
    const updated = editing
        ? payrollRecords.map(record => record.id === data.id ? { ...record, ...data } : record)
        : [...payrollRecords, { ...data, id: createId() }];
    if (commitCollection('payroll', updated, editing ? 'Payroll record updated.' : 'Payroll record saved.')) resetForm('payrollForm');
}

function handleAdminSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.name = data.name.trim();
    data.email = data.email.trim().toLowerCase();
    if (admins.some(admin => admin.email.toLowerCase() === data.email && admin.id !== data.id)) {
        showNotice('An administrator record with this email already exists.', true);
        return;
    }

    const editing = Boolean(data.id);
    const updated = editing
        ? admins.map(admin => admin.id === data.id ? { ...admin, ...data } : admin)
        : [...admins, { ...data, id: createId() }];
    if (commitCollection('admins', updated, editing ? 'Administrator record updated.' : 'Administrator record added.')) resetForm('adminForm');
}

function handleLeaveSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (data.endDate < data.startDate) {
        showNotice('The leave end date must be on or after the start date.', true);
        return;
    }
    data.employeeName = employeeName(data.employeeId);
    const editing = Boolean(data.id);
    const updated = editing
        ? leaveRequests.map(request => request.id === data.id ? { ...request, ...data } : request)
        : [...leaveRequests, { ...data, status: 'Pending', id: createId() }];
    if (commitCollection('leave', updated, editing ? 'Leave request updated.' : 'Leave request submitted.')) resetForm('leaveForm');
}

function handleCourseSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    data.title = data.title.trim();
    data.provider = data.provider.trim();
    data.employeeName = employeeName(data.employeeId);
    data.cost = numericValue(data.cost);
    const editing = Boolean(data.id);
    const updated = editing
        ? courses.map(course => course.id === data.id ? { ...course, ...data } : course)
        : [...courses, { ...data, id: createId() }];
    if (commitCollection('courses', updated, editing ? 'Course assignment updated.' : 'Course assigned.')) resetForm('courseForm');
}

function handleSettingsSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const nextSettings = {
        organization: data.organization.trim(),
        adminName: data.adminName.trim(),
        adminEmail: data.adminEmail.trim(),
        currency: data.currency
    };
    const nextAccount = adminAccount
        ? { ...adminAccount, name: nextSettings.adminName, email: nextSettings.adminEmail || adminAccount.email }
        : null;
    if (nextAccount) nextSettings.adminEmail = nextAccount.email;

    try {
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(nextSettings));
        if (nextAccount) localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(nextAccount));
    } catch (error) {
        console.error('Unable to save workspace settings.', error);
        showNotice('Could not save settings in this browser. Check available storage and try again.', true);
        return;
    }

    settings = nextSettings;
    if (nextAccount) {
        adminAccount = nextAccount;
        sessionStorage.setItem(ADMIN_SESSION_KEY, nextAccount.email);
    }
    currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: settings.currency });
    renderAll();
    updateNetPayPreview();
    showNotice('Workspace settings saved.');
}

function populateSettingsForm() {
    const form = document.getElementById('settingsForm');
    form.elements.organization.value = settings.organization;
    form.elements.adminName.value = settings.adminName;
    form.elements.adminEmail.value = settings.adminEmail;
    form.elements.currency.value = settings.currency;
}

function setReport(recordType, dateFrom, dateTo) {
    activeReport = { type: recordType, from: dateFrom, to: dateTo };
    const isInRange = date => (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    const heading = document.getElementById('reportTitle');
    const description = document.getElementById('reportDescription');
    const head = document.getElementById('reportHead');
    const body = document.getElementById('reportBody');
    const totalLabel = document.getElementById('reportTotalLabel');
    let records;

    if (recordType === 'employees') {
        records = employees.filter(employee => isInRange(employee.hireDate));
        reportColumns = ['Name', 'Email', 'Phone', 'Department', 'Job title', 'Hire date', 'Monthly salary'];
        reportRows = records.map(employee => [employee.name, employee.email, employee.phone, employee.department, employee.position, employee.hireDate, Number(employee.salary).toFixed(2)]);
        heading.textContent = 'Employee report';
        totalLabel.textContent = 'Combined monthly salary';
        document.getElementById('reportTotal').textContent = currency.format(records.reduce((sum, employee) => sum + Number(employee.salary), 0));
    } else if (recordType === 'attendance') {
        records = attendanceRecords.filter(record => isInRange(record.date));
        reportColumns = ['Employee', 'Date', 'Status', 'Check-in', 'Check-out'];
        reportRows = records.map(record => [employeeName(record.employeeId, record.employeeName), record.date, record.status, record.checkIn || '', record.checkOut || '']);
        heading.textContent = 'Attendance report';
        totalLabel.textContent = 'Present / late';
        document.getElementById('reportTotal').textContent = String(records.filter(record => record.status === 'Present' || record.status === 'Late').length);
    } else {
        records = payrollRecords.filter(record =>
            (!dateFrom || `${record.period}-31` >= dateFrom) &&
            (!dateTo || `${record.period}-01` <= dateTo)
        );
        reportColumns = ['Employee', 'Pay period', 'Base salary', 'Overtime', 'Bonus', 'Deductions', 'Net pay'];
        reportRows = records.map(record => [
            employeeName(record.employeeId, record.employeeName),
            record.period,
            Number(record.baseSalary).toFixed(2),
            Number(record.overtime).toFixed(2),
            Number(record.bonus).toFixed(2),
            Number(record.deductions).toFixed(2),
            (Number(record.baseSalary) + Number(record.overtime) + Number(record.bonus) - Number(record.deductions)).toFixed(2)
        ]);
        heading.textContent = 'Payroll report';
        totalLabel.textContent = 'Total net payroll';
        document.getElementById('reportTotal').textContent = currency.format(records.reduce((sum, record) => sum + Number(record.baseSalary) + Number(record.overtime) + Number(record.bonus) - Number(record.deductions), 0));
    }

    document.getElementById('reportRecordCount').textContent = String(records.length);
    description.textContent = `${records.length} matching record${records.length === 1 ? '' : 's'}${dateFrom || dateTo ? ` · ${dateFrom || 'any date'} to ${dateTo || 'any date'}` : ''}.`;
    head.innerHTML = `<tr>${reportColumns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr>`;
    body.innerHTML = reportRows.length
        ? reportRows.map(row => `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')
        : emptyRow(reportColumns.length, 'No records match these filters.');
    document.getElementById('exportReport').disabled = reportRows.length === 0;
}

function csvCell(value) {
    let safeValue = String(value ?? '');
    if (/^[=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
    return `"${safeValue.replace(/"/g, '""')}"`;
}

function exportCsv() {
    if (!reportRows.length) return;
    const csv = [reportColumns, ...reportRows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `employee-${document.querySelector('#reportForm select[name="type"]').value}-report.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
}

function applySearch() {
    const query = document.getElementById('globalSearch').value.trim().toLowerCase();
    const activeView = document.querySelector('.page-view:not([hidden])');
    if (!activeView) return;
    activeView.querySelectorAll('tbody tr[data-search]').forEach(row => {
        row.hidden = query !== '' && !row.dataset.search.includes(query);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('setupForm').addEventListener('submit', handleSetupSubmit);
    document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);
    document.getElementById('logoutButton').addEventListener('click', () => {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        document.getElementById('dashboardApp').hidden = true;
        document.getElementById('authScreen').hidden = false;
        document.getElementById('loginForm').reset();
        setAuthView('login');
    });
    document.getElementById('employeeForm').addEventListener('submit', handleEmployeeSubmit);
    document.getElementById('attendanceForm').addEventListener('submit', handleAttendanceSubmit);
    document.getElementById('payrollForm').addEventListener('submit', handlePayrollSubmit);
    document.getElementById('adminForm').addEventListener('submit', handleAdminSubmit);
    document.getElementById('leaveForm').addEventListener('submit', handleLeaveSubmit);
    document.getElementById('courseForm').addEventListener('submit', handleCourseSubmit);
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);
    document.getElementById('globalSearch').addEventListener('input', applySearch);
    document.getElementById('exportReport').addEventListener('click', exportCsv);
    document.getElementById('refreshDashboard').addEventListener('click', () => reloadSavedData(true));
    window.addEventListener('focus', () => {
        if (!document.getElementById('dashboardApp').hidden) reloadSavedData();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !document.getElementById('dashboardApp').hidden) reloadSavedData();
    });
    window.addEventListener('storage', event => {
        if (event.key === null || Object.values(STORAGE_KEYS).includes(event.key)) {
            if (!document.getElementById('dashboardApp').hidden) reloadSavedData();
        }
    });
    populateSettingsForm();
    document.getElementById('reportForm').addEventListener('submit', event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        if (formData.get('from') && formData.get('to') && formData.get('from') > formData.get('to')) {
            showNotice('The start date must be on or before the end date.', true);
            return;
        }
        setReport(formData.get('type'), formData.get('from'), formData.get('to'));
    });
    document.getElementById('payrollForm').addEventListener('input', updateNetPayPreview);
    document.querySelector('#payrollForm select[name="employeeId"]').addEventListener('change', event => {
        const employee = employees.find(item => item.id === event.target.value);
        if (employee && !document.getElementById('payrollForm').elements.id.value) {
            document.getElementById('payrollForm').elements.baseSalary.value = employee.salary;
            updateNetPayPreview();
        }
    });

    document.addEventListener('click', event => {
        const navLink = event.target.closest('[data-view]');
        if (navLink) {
            event.preventDefault();
            const viewName = navLink.dataset.view;
            document.querySelectorAll('.page-view').forEach(view => { view.hidden = view.id !== `view-${viewName}`; });
            document.querySelectorAll('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.view === viewName));
            document.querySelector('.admin-shortcut').classList.toggle('active', viewName === 'admin');
            document.getElementById('pageTitle').textContent = pageTitles[viewName] || 'Dashboard';
            document.getElementById('globalSearch').value = '';
            if (viewName === 'dashboard') {
                reloadSavedData();
            } else {
                applySearch();
            }
            return;
        }

        const goButton = event.target.closest('[data-go]');
        if (goButton) {
            document.querySelector(`[data-view="${goButton.dataset.go}"]`).click();
            return;
        }

        const resetButton = event.target.closest('[data-reset]');
        if (resetButton) {
            resetForm(resetButton.dataset.reset);
            return;
        }

        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) return;
        const { action, id } = actionButton.dataset;

        if (action === 'edit-employee') {
            const record = employees.find(employee => employee.id === id);
            if (record) beginEdit('employeeForm', record, 'Edit employee', 'Update employee');
        } else if (action === 'edit-attendance') {
            const record = attendanceRecords.find(item => item.id === id);
            if (record) beginEdit('attendanceForm', record, 'Edit attendance', 'Update attendance');
        } else if (action === 'edit-payroll') {
            const record = payrollRecords.find(item => item.id === id);
            if (record) {
                beginEdit('payrollForm', record, 'Edit payroll record', 'Update payroll');
                updateNetPayPreview();
            }
        } else if (action === 'edit-admin') {
            const record = admins.find(item => item.id === id);
            if (record) beginEdit('adminForm', record, 'Edit administrator', 'Update administrator');
        } else if (action === 'edit-leave') {
            const record = leaveRequests.find(item => item.id === id);
            if (record) beginEdit('leaveForm', record, 'Edit leave request', 'Update request');
        } else if (action === 'edit-course') {
            const record = courses.find(item => item.id === id);
            if (record) beginEdit('courseForm', record, 'Edit course assignment', 'Update course');
        } else if (action === 'approve-leave' || action === 'decline-leave') {
            const nextStatus = action === 'approve-leave' ? 'Approved' : 'Declined';
            const updated = leaveRequests.map(request => request.id === id && request.status === 'Pending'
                ? { ...request, status: nextStatus }
                : request);
            if (updated.some((request, index) => request !== leaveRequests[index])) {
                commitCollection('leave', updated, `Leave request ${nextStatus.toLowerCase()}.`);
            }
        } else if (action === 'delete-employee') {
            const employee = employees.find(item => item.id === id);
            if (!employee || !window.confirm(`Delete ${employee.name}? Their attendance and payroll history will be kept.`)) return;
            commitCollection('employees', employees.filter(item => item.id !== id), 'Employee deleted.');
        } else if (action === 'delete-attendance') {
            if (window.confirm('Delete this attendance record?')) {
                commitCollection('attendance', attendanceRecords.filter(item => item.id !== id), 'Attendance record deleted.');
            }
        } else if (action === 'delete-payroll') {
            if (window.confirm('Delete this payroll record?')) {
                commitCollection('payroll', payrollRecords.filter(item => item.id !== id), 'Payroll record deleted.');
            }
        } else if (action === 'delete-admin') {
            if (window.confirm('Delete this administrator directory record?')) {
                commitCollection('admins', admins.filter(item => item.id !== id), 'Administrator directory record deleted.');
            }
        } else if (action === 'delete-leave') {
            if (window.confirm('Delete this leave request?')) {
                commitCollection('leave', leaveRequests.filter(item => item.id !== id), 'Leave request deleted.');
            }
        } else if (action === 'delete-course') {
            if (window.confirm('Delete this course assignment?')) {
                commitCollection('courses', courses.filter(item => item.id !== id), 'Course assignment deleted.');
            }
        }
    });

    document.querySelector('#attendanceForm input[name="date"]').value = localDateString();
    document.querySelector('#payrollForm input[name="period"]').value = localDateString().slice(0, 7);
    document.querySelector('#leaveForm input[name="startDate"]').value = localDateString();
    document.querySelector('#leaveForm input[name="endDate"]').value = localDateString();
    document.querySelector('#courseForm input[name="startDate"]').value = localDateString();
    initializeAuth();
});
