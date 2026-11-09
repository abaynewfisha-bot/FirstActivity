const inquiryStorageKey = 'injibaraUniversity.inquiries.v1';

const studyAreas = [
    {
        title: 'Agriculture & environment',
        category: 'environment',
        categoryLabel: 'Environment',
        icon: 'fa-seedling',
        description: 'Explore questions about food systems, natural resources, and caring for the environment.'
    },
    {
        title: 'Business & economics',
        category: 'society',
        categoryLabel: 'People & society',
        icon: 'fa-chart-line',
        description: 'Discover ideas related to organizations, enterprise, markets, and economic life.'
    },
    {
        title: 'Education',
        category: 'society',
        categoryLabel: 'People & society',
        icon: 'fa-book-open-reader',
        description: 'Explore learning, teaching, and the many ways knowledge can be shared.'
    },
    {
        title: 'Health & life sciences',
        category: 'science',
        categoryLabel: 'Science & technology',
        icon: 'fa-heart-pulse',
        description: 'Follow your curiosity about health, living systems, and human wellbeing.'
    },
    {
        title: 'Technology & computing',
        category: 'science',
        categoryLabel: 'Science & technology',
        icon: 'fa-laptop-code',
        description: 'Explore computing, digital tools, and technology that can help solve problems.'
    },
    {
        title: 'Engineering & design',
        category: 'science',
        categoryLabel: 'Science & technology',
        icon: 'fa-compass-drafting',
        description: 'Learn about designing, building, and improving the systems people rely on.'
    },
    {
        title: 'Social & community studies',
        category: 'society',
        categoryLabel: 'People & society',
        icon: 'fa-people-group',
        description: 'Ask how people, communities, culture, and society shape one another.'
    },
    {
        title: 'Natural & physical sciences',
        category: 'environment',
        categoryLabel: 'Environment',
        icon: 'fa-leaf',
        description: 'Investigate the natural world and the ideas that help explain how it works.'
    }
];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function renderStudyAreas(filter = 'all', query = '') {
    const grid = document.getElementById('studyGrid');
    const emptyState = document.getElementById('studyEmpty');
    const normalizedQuery = query.trim().toLowerCase();
    const matches = studyAreas.filter(area => {
        const matchesFilter = filter === 'all' || area.category === filter;
        const matchesSearch = `${area.title} ${area.categoryLabel} ${area.description}`.toLowerCase().includes(normalizedQuery);
        return matchesFilter && matchesSearch;
    });

    grid.innerHTML = matches.map(area => `
        <article class="study-card">
            <div class="study-card-top">
                <span class="study-icon"><i class="fa-solid ${area.icon}" aria-hidden="true"></i></span>
                <span class="study-category">${escapeHtml(area.categoryLabel)}</span>
            </div>
            <h3>${escapeHtml(area.title)}</h3>
            <p>${escapeHtml(area.description)}</p>
            <a href="#inquiry" data-interest="${escapeHtml(area.title)}">Ask about this area <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
        </article>
    `).join('');
    emptyState.hidden = matches.length > 0;
}

function showFormMessage(message, isError = false) {
    const messageElement = document.getElementById('formMessage');
    messageElement.textContent = message;
    messageElement.classList.toggle('error', isError);
    messageElement.hidden = false;
}

function createInquiryReference() {
    const date = new Date();
    const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const randomBytes = new Uint8Array(4);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(randomBytes);
    } else {
        randomBytes.forEach((_, index) => { randomBytes[index] = Math.floor(Math.random() * 256); });
    }
    const randomPart = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 6).toUpperCase();
    return `IU-${datePart}-${randomPart}`;
}

function handleInquirySubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const inquiry = {
        id: createInquiryReference(),
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        level: data.level,
        interest: data.interest,
        message: data.message.trim(),
        createdAt: new Date().toISOString()
    };

    try {
        const saved = localStorage.getItem(inquiryStorageKey);
        const inquiries = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(inquiries)) throw new Error('Saved inquiries are not a valid list.');
        localStorage.setItem(inquiryStorageKey, JSON.stringify([...inquiries, inquiry]));
    } catch (error) {
        console.error('Unable to save the school inquiry in this browser.', error);
        showFormMessage('We could not save this inquiry in your browser. Check your browser storage and try again.', true);
        return;
    }

    form.reset();
    showFormMessage(`Inquiry ${inquiry.id} was saved on this device. It has not been sent to Injibara University.`);
}

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.getElementById('menuToggle');
    const primaryNav = document.getElementById('primaryNav');
    const studySearch = document.getElementById('studySearch');
    const interestSelect = document.getElementById('interestSelect');
    const inquiryForm = document.getElementById('inquiryForm');
    let activeFilter = 'all';

    document.getElementById('currentYear').textContent = String(new Date().getFullYear());
    interestSelect.insertAdjacentHTML('beforeend', studyAreas
        .map(area => `<option value="${escapeHtml(area.title)}">${escapeHtml(area.title)}</option>`)
        .join(''));
    renderStudyAreas();

    menuToggle.addEventListener('click', () => {
        const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', String(!isOpen));
        menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
        menuToggle.innerHTML = `<i class="fa-solid ${isOpen ? 'fa-bars' : 'fa-xmark'}" aria-hidden="true"></i>`;
        primaryNav.classList.toggle('is-open', !isOpen);
    });

    primaryNav.addEventListener('click', event => {
        if (!event.target.closest('a')) return;
        primaryNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
        menuToggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || menuToggle.getAttribute('aria-expanded') !== 'true') return;
        primaryNav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
        menuToggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        menuToggle.focus();
    });

    document.querySelectorAll('[data-filter]').forEach(button => {
        button.addEventListener('click', () => {
            activeFilter = button.dataset.filter;
            document.querySelectorAll('[data-filter]').forEach(filterButton => {
                const isActive = filterButton === button;
                filterButton.classList.toggle('active', isActive);
                filterButton.setAttribute('aria-pressed', String(isActive));
            });
            renderStudyAreas(activeFilter, studySearch.value);
        });
    });

    studySearch.addEventListener('input', () => renderStudyAreas(activeFilter, studySearch.value));

    document.getElementById('studyGrid').addEventListener('click', event => {
        const interestLink = event.target.closest('[data-interest]');
        if (!interestLink) return;
        interestSelect.value = interestLink.dataset.interest;
    });

    inquiryForm.addEventListener('submit', handleInquirySubmit);
    inquiryForm.addEventListener('input', () => {
        const message = document.getElementById('formMessage');
        message.hidden = true;
        message.classList.remove('error');
    });
});
