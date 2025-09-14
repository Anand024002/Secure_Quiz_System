// Firebase Configuration (REPLACE WITH YOUR CONFIG)
const firebaseConfig = {
    apiKey: "AIzaSyACIZJ9sDvwlIu--I5s7dJWcXmtVuEB5kE",
    authDomain: "quiz-competition-c77a3.firebaseapp.com",
    projectId: "quiz-competition-c77a3",
    storageBucket: "quiz-competition-c77a3.firebasestorage.app",
    messagingSenderId: "518244647689",
    appId: "1:518244647689:web:21499bbd2f2ec8aee1c9d8",
    measurementId: "G-WB60T13ST3"
};

// Initialize Firebase
let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization failed:', error);
    showMessage('loginMessage', 'Running in demo mode - using local storage', 'error');
}

// Global state management
let currentUser = null;
let isAdmin = false;
let editingQuestionIndex = -1;

// Admin credentials (in real app, this should be server-side)
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'admin123'
};

// Quiz configuration and state
let quizState = {
    currentQuestion: 0,
    answers: {},
    violations: 0,
    maxViolations: 3,
    timeLeft: 1800, // 30 minutes
    isActive: false,
    startTime: null,
    student: null
};

// Default questions (will be loaded from Firebase if available)
let questions = [
    {
        text: "Which of the following is NOT a valid JavaScript data type?",
        options: ["undefined", "boolean", "integer", "symbol"],
        correct: 2
    },
    {
        text: "What is the time complexity of binary search algorithm?",
        options: ["O(n)", "O(log n)", "O(n²)", "O(1)"],
        correct: 1
    },
    {
        text: "Which HTTP status code indicates a successful response?",
        options: ["404", "500", "200", "301"],
        correct: 2
    },
    {
        text: "In object-oriented programming, what does 'inheritance' mean?",
        options: [
            "Creating multiple objects",
            "A class acquiring properties from another class",
            "Hiding implementation details",
            "Grouping related functions"
        ],
        correct: 1
    },
    {
        text: "Which of these is a NoSQL database?",
        options: ["MySQL", "PostgreSQL", "MongoDB", "SQLite"],
        correct: 2
    }
];

// Security monitoring variables
let tabSwitchCount = 0;
let devToolsDetected = false;
let securityTimer = null;
let violationLog = [];

// Utility functions
function showMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    element.innerHTML = `<div class="${type}">${message}</div>`;
}

function setLoading(buttonId, loading = true) {
    const button = document.getElementById(buttonId);
    button.disabled = loading;
    if (loading) {
        button.innerHTML = button.innerHTML.replace('Login', 'Loading...').replace('Start Quiz', 'Loading...');
    }
}

// Batch options update function
function updateBatchOptions() {
    const classSelect = document.getElementById('studentClass');
    const batchSelect = document.getElementById('studentBatch');
    const selectedClass = classSelect.value;
    
    batchSelect.innerHTML = '<option value="">Select Batch</option>';
    
    if (selectedClass === 'SE') {
        ['S1', 'S2', 'S3', 'S4'].forEach(batch => {
            const option = document.createElement('option');
            option.value = batch;
            option.textContent = batch;
            batchSelect.appendChild(option);
        });
    } else if (selectedClass === 'TE') {
        ['T1', 'T2', 'T3', 'T4'].forEach(batch => {
            const option = document.createElement('option');
            option.value = batch;
            option.textContent = batch;
            batchSelect.appendChild(option);
        });
    }
}

// Database functions
async function saveToFirebase(collection, docId, data) {
    if (!db) {
        const existingData = JSON.parse(localStorage.getItem(collection) || '[]');
        const index = existingData.findIndex(item => item.id === docId);
        if (index >= 0) {
            existingData[index] = { ...data, id: docId };
        } else {
            existingData.push({ ...data, id: docId });
        }
        localStorage.setItem(collection, JSON.stringify(existingData));
        return;
    }

    try {
        await db.collection(collection).doc(docId).set(data, { merge: true });
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        throw error;
    }
}

async function getFromFirebase(collection, docId = null) {
    if (!db) {
        const data = JSON.parse(localStorage.getItem(collection) || '[]');
        if (docId) {
            return data.find(item => item.id === docId) || null;
        }
        return data;
    }

    try {
        if (docId) {
            const doc = await db.collection(collection).doc(docId).get();
            return doc.exists ? doc.data() : null;
        } else {
            const snapshot = await db.collection(collection).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    } catch (error) {
        console.error('Error getting from Firebase:', error);
        throw error;
    }
}

async function deleteFromFirebase(collection, docId) {
    if (!db) {
        const data = JSON.parse(localStorage.getItem(collection) || '[]');
        const filtered = data.filter(item => item.id !== docId);
        localStorage.setItem(collection, JSON.stringify(filtered));
        return;
    }

    try {
        await db.collection(collection).doc(docId).delete();
    } catch (error) {
        console.error('Error deleting from Firebase:', error);
        throw error;
    }
}

// Page navigation functions
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

function showStudentLogin() {
    showPage('loginPage');
}

function showAdminLogin() {
    showPage('adminLoginPage');
}

function showAdminTab(tabName) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.admin-content').forEach(content => {
        content.classList.remove('active');
    });
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    if (tabName === 'questions') {
        loadQuestions();
    }
}

// Authentication functions
async function studentLogin() {
    const rollNumber = document.getElementById('rollNumber').value.trim();
    const studentName = document.getElementById('studentName').value.trim();
    const studentClass = document.getElementById('studentClass').value;
    const studentBatch = document.getElementById('studentBatch').value;

    if (!rollNumber || !studentName || !studentClass || !studentBatch) {
        showMessage('loginMessage', 'Please fill in all fields', 'error');
        return;
    }

    setLoading('studentLoginBtn', true);
    showMessage('loginMessage', 'Checking existing records...', 'loading');

    try {
        const existingResult = await getFromFirebase('quiz_results', rollNumber);
        if (existingResult && existingResult.status === 'completed') {
            showMessage('loginMessage', 'You have already completed this quiz!', 'error');
            setLoading('studentLoginBtn', false);
            return;
        }

        currentUser = {
            id: rollNumber,
            name: studentName,
            class: studentClass,
            batch: studentBatch,
            type: 'student'
        };

        quizState.student = currentUser;
        await loadQuestions(); // Load questions before starting quiz
        document.getElementById('fullscreenPrompt').style.display = 'flex';
        
    } catch (error) {
        console.error('Login error:', error);
        showMessage('loginMessage', 'Error checking records. Please try again.', 'error');
    }
    
    setLoading('studentLoginBtn', false);
}

async function adminLogin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        setLoading('adminLoginBtn', true);
        showMessage('adminLoginMessage', 'Loading dashboard...', 'loading');
        
        currentUser = { type: 'admin' };
        isAdmin = true;
        showPage('adminPage');
        await loadAdminDashboard();
        
        setLoading('adminLoginBtn', false);
    } else {
        showMessage('adminLoginMessage', 'Invalid admin credentials', 'error');
    }
}

function logout() {
    currentUser = null;
    isAdmin = false;
    showPage('loginPage');
    
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('loginMessage').innerHTML = '';
    document.getElementById('adminLoginMessage').innerHTML = '';
}

// Question management functions
async function loadQuestions() {
    try {
        const savedQuestions = await getFromFirebase('questions');
        if (savedQuestions && savedQuestions.length > 0) {
            questions = savedQuestions.map(q => ({
                text: q.text,
                options: q.options,
                correct: q.correct
            }));
        } else if (isAdmin) {
            // Save default questions to Firebase
            await saveQuestions();
        }
        
        if (isAdmin) {
            displayQuestions();
        }
    } catch (error) {
        console.error('Error loading questions:', error);
    }
}

async function saveQuestions() {
    try {
        const questionsData = {
            questions: questions,
            lastUpdated: new Date().toISOString()
        };
        await saveToFirebase('questions', 'main', questionsData);
    } catch (error) {
        console.error('Error saving questions:', error);
    }
}

function displayQuestions() {
    const questionsList = document.getElementById('questionsList');
    questionsList.innerHTML = '';

    if (questions.length === 0) {
        questionsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No questions available. Add some questions to get started.</div>';
        return;
    }

    questions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';
        
        questionDiv.innerHTML = `
            <h4>Question ${index + 1}</h4>
            <p>${question.text}</p>
            <ul class="question-options">
                ${question.options.map((option, optIndex) => 
                    `<li class="${optIndex === question.correct ? 'correct' : ''}">${String.fromCharCode(65 + optIndex)}. ${option}</li>`
                ).join('')}
            </ul>
            <div class="question-actions">
                <button class="btn-small btn-edit" onclick="editQuestion(${index})">Edit</button>
                <button class="btn-small btn-delete" onclick="deleteQuestion(${index})">Delete</button>
            </div>
        `;
        
        questionsList.appendChild(questionDiv);
    });
}

function editQuestion(index) {
    const question = questions[index];
    editingQuestionIndex = index;
    
    document.getElementById('formTitle').textContent = 'Edit Question';
    document.getElementById('questionInput').value = question.text;
    
    question.options.forEach((option, i) => {
        document.getElementById(`option${i}`).value = option;
        document.getElementById(`correct${i}`).checked = i === question.correct;
    });
    
    document.getElementById('cancelBtn').style.display = 'inline-block';
    document.querySelector('.question-form').scrollIntoView({ behavior: 'smooth' });
}

async function deleteQuestion(index) {
    if (confirm('Are you sure you want to delete this question?')) {
        questions.splice(index, 1);
        await saveQuestions();
        displayQuestions();
        showMessage('questionFormMessage', 'Question deleted successfully!', 'success');
    }
}

async function saveQuestion() {
    const questionText = document.getElementById('questionInput').value.trim();
    const options = [
        document.getElementById('option0').value.trim(),
        document.getElementById('option1').value.trim(),
        document.getElementById('option2').value.trim(),
        document.getElementById('option3').value.trim()
    ];
    
    const correctAnswer = document.querySelector('input[name="correctAnswer"]:checked');
    
    if (!questionText) {
        showMessage('questionFormMessage', 'Please enter a question.', 'error');
        return;
    }
    
    if (options.some(option => !option)) {
        showMessage('questionFormMessage', 'Please fill in all options.', 'error');
        return;
    }
    
    if (!correctAnswer) {
        showMessage('questionFormMessage', 'Please select the correct answer.', 'error');
        return;
    }

    const newQuestion = {
        text: questionText,
        options: options,
        correct: parseInt(correctAnswer.value)
    };

    try {
        if (editingQuestionIndex >= 0) {
            questions[editingQuestionIndex] = newQuestion;
            showMessage('questionFormMessage', 'Question updated successfully!', 'success');
        } else {
            questions.push(newQuestion);
            showMessage('questionFormMessage', 'Question added successfully!', 'success');
        }
        
        await saveQuestions();
        displayQuestions();
        clearQuestionForm();
    } catch (error) {
        console.error('Error saving question:', error);
        showMessage('questionFormMessage', 'Error saving question. Please try again.', 'error');
    }
}

function cancelEdit() {
    clearQuestionForm();
}

function clearQuestionForm() {
    editingQuestionIndex = -1;
    document.getElementById('formTitle').textContent = 'Add New Question';
    document.getElementById('questionInput').value = '';
    
    for (let i = 0; i < 4; i++) {
        document.getElementById(`option${i}`).value = '';
        document.getElementById(`correct${i}`).checked = false;
    }
    
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('questionFormMessage').innerHTML = '';
}

// Quiz functions
async function startSecureQuiz() {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen();
    }

    document.getElementById('fullscreenPrompt').style.display = 'none';
    showPage('quizPage');

    quizState.isActive = true;
    quizState.startTime = Date.now();
    document.getElementById('studentInfo').textContent = 
        `Student: ${currentUser.name} (${currentUser.id})`;
    
    await addOrUpdateStudentRecord('in-progress');
    
    loadQuestion();
    startTimer();
    initializeSecurity();
}

async function addOrUpdateStudentRecord(status) {
    const record = {
        rollNumber: currentUser.id,
        name: currentUser.name,
        class: currentUser.class,
        batch: currentUser.batch,
        status: status,
        score: 0,
        totalQuestions: questions.length,
        answers: quizState.answers,
        violations: quizState.violations,
        violationLog: violationLog,
        timeSpent: quizState.startTime ? Date.now() - quizState.startTime : 0,
        startedAt: quizState.startTime ? new Date(quizState.startTime).toISOString() : new Date().toISOString(),
        completedAt: status === 'completed' ? new Date().toISOString() : null,
        lastUpdated: new Date().toISOString()
    };

    try {
        await saveToFirebase('quiz_results', currentUser.id, record);
    } catch (error) {
        console.error('Error saving quiz record:', error);
    }
}

function loadQuestion() {
    if (questions.length === 0) {
        document.getElementById('questionText').textContent = 'No questions available. Please contact the administrator.';
        return;
    }

    const question = questions[quizState.currentQuestion];
    
    document.getElementById('questionNumber').textContent = 
        `Question ${quizState.currentQuestion + 1} of ${questions.length}`;
    document.getElementById('questionText').textContent = question.text;

    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    question.options.forEach((option, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option';
        optionDiv.onclick = () => selectOption(index);

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'option';
        input.value = index;
        input.id = `option${index}`;

        const label = document.createElement('label');
        label.textContent = option;
        label.setAttribute('for', `option${index}`);

        optionDiv.appendChild(input);
        optionDiv.appendChild(label);
        optionsContainer.appendChild(optionDiv);

        if (quizState.answers[quizState.currentQuestion] === index) {
            input.checked = true;
            optionDiv.classList.add('selected');
        }
    });

    updateNavigationButtons();
}

async function selectOption(index) {
    quizState.answers[quizState.currentQuestion] = index;
    
    document.querySelectorAll('.option').forEach((opt, i) => {
        opt.classList.toggle('selected', i === index);
        opt.querySelector('input').checked = i === index;
    });

    await addOrUpdateStudentRecord('in-progress');
}

function nextQuestion() {
    if (quizState.currentQuestion < questions.length - 1) {
        quizState.currentQuestion++;
        loadQuestion();
    }
}

function previousQuestion() {
    if (quizState.currentQuestion > 0) {
        quizState.currentQuestion--;
        loadQuestion();
    }
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');

    prevBtn.style.display = quizState.currentQuestion === 0 ? 'none' : 'block';
    
    if (quizState.currentQuestion === questions.length - 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
    }
}

// Timer functions
function startTimer() {
    const timerElement = document.getElementById('timer');
    
    const updateTimer = () => {
        const minutes = Math.floor(quizState.timeLeft / 60);
        const seconds = quizState.timeLeft % 60;
        timerElement.textContent = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (quizState.timeLeft <= 0) {
            forceSubmitQuiz('Time up');
        } else {
            quizState.timeLeft--;
        }
    };

    updateTimer();
    securityTimer = setInterval(updateTimer, 1000);
}

// Security functions
function initializeSecurity() {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        logViolation('Right-click attempt');
    });

    document.addEventListener('selectstart', (e) => {
        e.preventDefault();
    });

    document.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
        const forbiddenKeys = ['F12', 'F5', 'F11'];
        const forbiddenCombos = [
            { ctrl: true, key: 'r' }, { ctrl: true, key: 'R' },
            { ctrl: true, key: 'u' }, { ctrl: true, key: 'U' },
            { ctrl: true, key: 's' }, { ctrl: true, key: 'S' },
            { ctrl: true, key: 'a' }, { ctrl: true, key: 'A' },
            { ctrl: true, key: 'c' }, { ctrl: true, key: 'C' },
            { ctrl: true, key: 'v' }, { ctrl: true, key: 'V' },
            { ctrl: true, key: 'x' }, { ctrl: true, key: 'X' },
            { ctrl: true, shift: true, key: 'i' }, { ctrl: true, shift: true, key: 'I' },
            { ctrl: true, shift: true, key: 'j' }, { ctrl: true, shift: true, key: 'J' },
            { ctrl: true, shift: true, key: 'c' }, { ctrl: true, shift: true, key: 'C' },
            { alt: true, key: 'Tab' }, { alt: true, key: 'F4' }
        ];

        if (forbiddenKeys.includes(e.key)) {
            e.preventDefault();
            logViolation(`Forbidden key: ${e.key}`);
            return false;
        }

        for (let combo of forbiddenCombos) {
            let match = true;
            if (combo.ctrl && !e.ctrlKey) match = false;
            if (combo.alt && !e.altKey) match = false;
            if (combo.shift && !e.shiftKey) match = false;
            if (combo.key && e.key !== combo.key) match = false;

            if (match) {
                e.preventDefault();
                logViolation(`Forbidden combination: ${JSON.stringify(combo)}`);
                return false;
            }
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && quizState.isActive) {
            tabSwitchCount++;
            logViolation('Tab switch detected');
        }
    });

    window.addEventListener('blur', () => {
        if (quizState.isActive) {
            logViolation('Window focus lost');
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && quizState.isActive) {
            logViolation('Fullscreen exited');
            showWarning('Fullscreen mode required!', 'Please return to fullscreen to continue the quiz.');
        }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (quizState.isActive) {
                logViolation('Window resize detected (possible dev tools)');
            }
        }, 100);
    });

    setInterval(() => {
        if (quizState.isActive) {
            detectDevTools();
        }
    }, 1000);

    window.addEventListener('beforeunload', (e) => {
        if (quizState.isActive) {
            e.preventDefault();
            e.returnValue = '';
            logViolation('Attempted to leave page');
        }
    });
}

function detectDevTools() {
    const threshold = 160;
    if (window.outerHeight - window.innerHeight > threshold || 
        window.outerWidth - window.innerWidth > threshold) {
        if (!devToolsDetected) {
            devToolsDetected = true;
            logViolation('Developer tools detected');
        }
    } else {
        devToolsDetected = false;
    }
}

async function logViolation(type) {
    const violation = {
        type: type,
        timestamp: new Date().toISOString(),
        question: quizState.currentQuestion + 1
    };
    
    violationLog.push(violation);
    quizState.violations++;
    
    updateViolationCounter();
    updateStatusIndicator();
    await addOrUpdateStudentRecord('in-progress');

    if (quizState.violations >= quizState.maxViolations) {
        showWarning(
            'Maximum Violations Reached!', 
            'Your quiz will be automatically submitted due to multiple security violations.'
        );
        setTimeout(() => {
            forceSubmitQuiz('Too many violations');
        }, 3000);
    } else {
        showWarning(
            'Security Violation Detected!', 
            `${type}. You have ${quizState.maxViolations - quizState.violations} warning(s) remaining.`
        );
    }
}

function updateViolationCounter() {
    const counter = document.getElementById('violationCounter');
    counter.textContent = `Violations: ${quizState.violations}/${quizState.maxViolations}`;
    
    if (quizState.violations > 0) {
        counter.style.color = '#e74c3c';
        counter.style.background = 'rgba(231, 76, 60, 0.1)';
    }
}

function updateStatusIndicator() {
    const indicator = document.getElementById('statusIndicator');
    
    if (quizState.violations === 0) {
        indicator.textContent = '🔒 Secure Mode';
        indicator.className = 'status-indicator status-secure';
    } else {
        indicator.textContent = '⚠️ Violations Detected';
        indicator.className = 'status-indicator status-warning';
    }
}

function showWarning(title, text) {
    document.getElementById('warningOverlay').style.display = 'flex';
    document.querySelector('.warning-title').textContent = title;
    document.getElementById('warningText').textContent = text;
}

function dismissWarning() {
    document.getElementById('warningOverlay').style.display = 'none';
}

// Quiz submission functions
function submitQuiz() {
    if (confirm('Are you sure you want to submit your quiz? This action cannot be undone.')) {
        completeQuiz();
    }
}

function forceSubmitQuiz(reason) {
    alert(`Quiz automatically submitted: ${reason}`);
    completeQuiz();
}

async function completeQuiz() {
    quizState.isActive = false;
    clearInterval(securityTimer);
    
    let score = 0;
    let totalAnswered = 0;
    
    questions.forEach((question, index) => {
        if (quizState.answers.hasOwnProperty(index)) {
            totalAnswered++;
            if (quizState.answers[index] === question.correct) {
                score++;
            }
        }
    });

    try {
        const finalRecord = {
            rollNumber: currentUser.id,
            name: currentUser.name,
            class: currentUser.class,
            batch: currentUser.batch,
            status: 'completed',
            score: score,
            totalQuestions: questions.length,
            timeSpent: Date.now() - quizState.startTime,
            completedAt: new Date().toISOString(),
            answers: quizState.answers,
            violations: quizState.violations,
            violationLog: violationLog,
            startedAt: new Date(quizState.startTime).toISOString(),
            lastUpdated: new Date().toISOString()
        };

        await saveToFirebase('quiz_results', currentUser.id, finalRecord);
    } catch (error) {
        console.error('Error saving final results:', error);
    }

    if (document.exitFullscreen) {
        document.exitFullscreen();
    }

    alert(`Quiz Completed!\n\nScore: ${score}/${questions.length} (${Math.round((score/questions.length)*100)}%)\nQuestions Answered: ${totalAnswered}/${questions.length}\nViolations: ${quizState.violations}\nTime Taken: ${Math.floor((Date.now() - quizState.startTime) / 1000)} seconds`);
    
    showPage('loginPage');
    resetQuizState();
}

function resetQuizState() {
    quizState = {
        currentQuestion: 0,
        answers: {},
        violations: 0,
        maxViolations: 3,
        timeLeft: 1800,
        isActive: false,
        startTime: null,
        student: null
    };
    violationLog = [];
    currentUser = null;
    
    document.getElementById('rollNumber').value = '';
    document.getElementById('studentName').value = '';
    document.getElementById('studentClass').value = '';
    document.getElementById('studentBatch').value = '';
    document.getElementById('loginMessage').innerHTML = '';
}

// Admin dashboard functions
async function loadAdminDashboard() {
    try {
        await loadQuestions();
        await updateStats();
        await loadResultsTable();
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        alert('Error loading dashboard data. Please refresh and try again.');
    }
}

async function updateStats() {
    try {
        const results = await getFromFirebase('quiz_results');
        const completedResults = results.filter(r => r.status === 'completed');
        
        document.getElementById('totalStudents').textContent = results.length;
        document.getElementById('completedQuizzes').textContent = completedResults.length;
        
        if (completedResults.length > 0) {
            const avgScore = completedResults.reduce((sum, r) => sum + (r.score / r.totalQuestions), 0) / completedResults.length;
            document.getElementById('averageScore').textContent = Math.round(avgScore * 100) + '%';
        } else {
            document.getElementById('averageScore').textContent = '0%';
        }
        
        const totalViolations = results.reduce((sum, r) => sum + (r.violations || 0), 0);
        document.getElementById('totalViolations').textContent = totalViolations;
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

async function loadResultsTable() {
    try {
        const results = await getFromFirebase('quiz_results');
        displayResults(results);
    } catch (error) {
        console.error('Error loading results table:', error);
        document.getElementById('resultsTableBody').innerHTML = '<tr><td colspan="10">Error loading results</td></tr>';
    }
}

function displayResults(results) {
    const tableBody = document.getElementById('resultsTableBody');
    tableBody.innerHTML = '';

    if (results.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px;">No quiz results found</td></tr>';
        return;
    }

    results.forEach(result => {
        const row = document.createElement('tr');
        
        const statusClass = result.status === 'completed' ? 'status-completed' : 
                          result.status === 'in-progress' ? 'status-in-progress' : 'status-violations';
        
        const violationClass = (result.violations || 0) > 0 ? 'status-violations' : '';
        
        const timeSpent = result.timeSpent ? formatTime(result.timeSpent) : 'N/A';
        const scorePercentage = result.status === 'completed' ? 
            Math.round((result.score / result.totalQuestions) * 100) : 'N/A';

        row.innerHTML = `
            <td>${result.rollNumber || result.id}</td>
            <td>${result.name}</td>
            <td>${result.class}</td>
            <td>${result.batch}</td>
            <td>${result.status === 'completed' ? `${result.score}/${result.totalQuestions} (${scorePercentage}%)` : 'N/A'}</td>
            <td>${timeSpent}</td>
            <td><span class="status-badge ${violationClass}">${result.violations || 0}</span></td>
            <td><span class="status-badge ${statusClass}">${result.status}</span></td>
            <td>${new Date(result.startedAt).toLocaleString()}</td>
            <td>
                <button onclick="viewDetails('${result.rollNumber || result.id}')" class="btn-secondary" style="padding: 5px 10px; font-size: 0.8rem;">View</button>
                <button onclick="deleteResult('${result.rollNumber || result.id}')" class="btn-secondary" style="padding: 5px 10px; font-size: 0.8rem; background: #e74c3c; color: white; margin-left: 5px;">Delete</button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

function formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

async function filterResults() {
    const classFilter = document.getElementById('classFilter').value;
    const batchFilter = document.getElementById('batchFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchTerm = document.getElementById('searchStudent').value.toLowerCase();

    try {
        let results = await getFromFirebase('quiz_results');

        if (classFilter) {
            results = results.filter(r => r.class === classFilter);
        }

        if (batchFilter) {
            results = results.filter(r => r.batch === batchFilter);
        }

        if (statusFilter) {
            if (statusFilter === 'violations') {
                results = results.filter(r => (r.violations || 0) > 0);
            } else {
                results = results.filter(r => r.status === statusFilter);
            }
        }

        if (searchTerm) {
            results = results.filter(r => 
                (r.name && r.name.toLowerCase().includes(searchTerm)) || 
                (r.rollNumber && r.rollNumber.toLowerCase().includes(searchTerm)) ||
                (r.id && r.id.toLowerCase().includes(searchTerm))
            );
        }

        displayResults(results);
    } catch (error) {
        console.error('Error filtering results:', error);
    }
}

async function viewDetails(rollNumber) {
    try {
        const result = await getFromFirebase('quiz_results', rollNumber);
        if (!result) {
            alert('Student record not found');
            return;
        }

        let detailsText = `Student Details:\n`;
        detailsText += `Roll No: ${result.rollNumber || result.id}\n`;
        detailsText += `Name: ${result.name}\n`;
        detailsText += `Class: ${result.class}\n`;
        detailsText += `Batch: ${result.batch}\n`;
        detailsText += `Status: ${result.status}\n`;
        detailsText += `Score: ${result.status === 'completed' ? `${result.score}/${result.totalQuestions}` : 'N/A'}\n`;
        detailsText += `Violations: ${result.violations || 0}\n`;
        detailsText += `Time Spent: ${result.timeSpent ? formatTime(result.timeSpent) : 'N/A'}\n`;
        detailsText += `Started At: ${new Date(result.startedAt).toLocaleString()}\n`;
        
        if (result.completedAt) {
            detailsText += `Completed At: ${new Date(result.completedAt).toLocaleString()}\n`;
        }

        if (result.violationLog && result.violationLog.length > 0) {
            detailsText += `\nViolation Log:\n`;
            result.violationLog.forEach(violation => {
                detailsText += `- ${violation.type} at Q${violation.question} (${new Date(violation.timestamp).toLocaleTimeString()})\n`;
            });
        }

        if (result.status === 'completed' && result.answers && questions.length > 0) {
            detailsText += `\nAnswers:\n`;
            questions.forEach((question, index) => {
                const userAnswer = result.answers[index];
                const isCorrect = userAnswer === question.correct;
                detailsText += `Q${index + 1}: ${userAnswer !== undefined ? question.options[userAnswer] : 'Not answered'} ${isCorrect ? '✓' : '✗'}\n`;
            });
        }

        alert(detailsText);
    } catch (error) {
        console.error('Error viewing details:', error);
        alert('Error loading student details');
    }
}

async function deleteResult(rollNumber) {
    if (confirm('Are you sure you want to delete this result? This action cannot be undone.')) {
        try {
            await deleteFromFirebase('quiz_results', rollNumber);
            await loadAdminDashboard();
            alert('Result deleted successfully');
        } catch (error) {
            console.error('Error deleting result:', error);
            alert('Error deleting result');
        }
    }
}

async function exportResults() {
    try {
        const results = await getFromFirebase('quiz_results');
        if (results.length === 0) {
            alert('No results to export');
            return;
        }

        const csvContent = generateCSV(results);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quiz_results_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting results:', error);
        alert('Error exporting results');
    }
}

function generateCSV(results) {
    const headers = [
        'Roll Number', 'Name', 'Class', 'Batch', 'Status', 'Score', 'Total Questions', 
        'Percentage', 'Violations', 'Time Spent (minutes)', 'Started At', 'Completed At'
    ];

    let csv = headers.join(',') + '\n';

    results.forEach(result => {
        const percentage = result.status === 'completed' ? 
            Math.round((result.score / result.totalQuestions) * 100) : 0;
        
        const timeSpentMinutes = result.timeSpent ? Math.round(result.timeSpent / 60000) : 0;
        
        const row = [
            result.rollNumber || result.id,
            `"${result.name}"`,
            result.class,
            result.batch,
            result.status,
            result.score || 0,
            result.totalQuestions,
            percentage,
            result.violations || 0,
            timeSpentMinutes,
            `"${new Date(result.startedAt).toLocaleString()}"`,
            result.completedAt ? `"${new Date(result.completedAt).toLocaleString()}"` : 'N/A'
        ];
        
        csv += row.join(',') + '\n';
    });

    return csv;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    showPage('loginPage');
});