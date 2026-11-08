
const $ = selector => document.querySelector(selector);

const today = new Date();

const iso = date => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const parseDate = value => new Date(value + 'T12:00:00');

const shiftDate = (date, amount) => {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
};

const monday = date => {
  const d = new Date(date);
  d.setHours(12,0,0,0);
  d.setDate(d.getDate() - (d.getDay()+6)%7);
  return d;
};

const todayKey = iso(today);

const defaults = [
  {id:'vit',name:'Tomar vitaminas',emoji:'💊',target:7},
  {id:'gym',name:'Ginásio',emoji:'💪',target:4},
  {id:'read',name:'Ler 20 páginas',emoji:'📖',target:7},
  {id:'water',name:'Beber 2,5L de água',emoji:'💧',target:7},
  {id:'study',name:'Estudar',emoji:'🧠',target:5}
];

function loadState() {
  try {
    const saved = JSON.parse(
      localStorage.getItem('habittracker-v1') ||
      localStorage.getItem('dailyflow-v1') ||
      'null'
    );

    if (saved && Array.isArray(saved.habits)) {
      return {
        habits: saved.habits.map(h => ({
          ...h,
          target: Math.min(7, Math.max(1, Number(h.target) || 7))
        })),
        done: saved.done || {},
        tasks: saved.tasks || {},
        moods: saved.moods || {}
      };
    }
  } catch (error) {
    console.error('Erro ao carregar dados:', error);
  }

  return {
    habits: defaults.map(h => ({...h})),
    done: {},
    tasks: {},
    moods: {}
  };
}

let state = loadState();

let weekOffset = 0;
let monthDate = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = todayKey;
let editingHabitId = null;
let toastTimer;

function save() {
  localStorage.setItem('habittracker-v1', JSON.stringify(state));
  localStorage.setItem('dailyflow-v1', JSON.stringify(state));
  render();
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[char]);
}

function formatDate(date, options) {
  return new Intl.DateTimeFormat('pt-PT', options).format(date);
}

function isDone(id, date) {
  return Boolean((state.done[date] || {})[id]);
}

function setDone(id, date, value) {
  state.done[date] ??= {};

  if (value) {
    state.done[date][id] = true;
  } else {
    delete state.done[date][id];
  }

  save();
}

// ---------------------------------
// WEEKLY HABIT TRACKER
// ---------------------------------

function weekDates() {
  const start = shiftDate(monday(today), weekOffset * 7);

  return Array.from(
    {length:7},
    (_,i) => shiftDate(start,i)
  );
}

function renderWeek() {
  const dates = weekDates();

  let html = `
    <div class="dayhead" style="text-align:left">HÁBITO</div>
  `;

  dates.forEach(date => {
    html += `
      <div class="dayhead">
        ${formatDate(date,{weekday:'short'}).slice(0,2).toUpperCase()}
        <br>${date.getDate()}
      </div>
    `;
  });

  state.habits.forEach(habit => {
    html += `
      <div class="habitname" title="${escapeHTML(habit.name)}">
        <span class="emoji">${escapeHTML(habit.emoji || '✨')}</span>
        ${escapeHTML(habit.name)}
      </div>
    `;

    dates.forEach(date => {
      const dateKey = iso(date);
      const completed = isDone(habit.id,dateKey);
      const future = dateKey > todayKey;

      html += `
        <button
          class="dot ${completed?'done':''} ${dateKey===todayKey?'today':''}"
          data-habit="${escapeHTML(habit.id)}"
          data-date="${dateKey}"
          ${future?'disabled':''}
          title="${escapeHTML(habit.name)} - ${dateKey}">
          ${completed?'✓':''}
        </button>
      `;
    });
  });

  if (!state.habits.length) {
    html += '<div class="empty">Adiciona o teu primeiro hábito.</div>';
  }

  $('#weekGrid').innerHTML = html;

  $('#weekGrid').querySelectorAll('[data-habit]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.habit;
      const date = button.dataset.date;
      setDone(id,date,!isDone(id,date));
    });
  });

  $('#weekLabel').textContent =
    `${formatDate(dates[0],{day:'numeric',month:'short'})} – ${formatDate(dates[6],{day:'numeric',month:'short'})}`;

  let possible = 0;
  let completed = 0;

  dates.forEach(date => {
    const dateKey = iso(date);

    if (dateKey <= todayKey) {
      state.habits.forEach(habit => {
        possible++;

        if (isDone(habit.id,dateKey)) {
          completed++;
        }
      });
    }
  });

  const percentage = possible
    ? Math.round(completed / possible * 100)
    : 0;

  $('#weekCount').textContent = `${completed} de ${possible} registos`;
  $('#weekPct').textContent = percentage + '%';
  $('#weekProgress').style.width = percentage + '%';
}

// ---------------------------------
// TASKS
// ---------------------------------

function tasksFor(date) {
  return state.tasks[date] || [];
}

function renderTasks() {
  const tasks = tasksFor(selectedDate);

  $('#taskList').innerHTML = tasks.length
    ? tasks.map((task,index) => `
      <div class="task ${task.done?'completed':''}">
        <span class="taskicon">${escapeHTML(task.emoji || '◦')}</span>
        <label for="task${index}">
          ${escapeHTML(task.name)}
        </label>
        <input
          class="check"
          type="checkbox"
          id="task${index}"
          data-task="${index}"
          ${task.done?'checked':''}>
      </div>
    `).join('')
    : '<div class="empty">Ainda não tens tarefas para este dia.</div>';

  $('#taskList').querySelectorAll('[data-task]').forEach(input => {
    input.addEventListener('change', () => {
      tasks[Number(input.dataset.task)].done = input.checked;
      state.tasks[selectedDate] = tasks;
      save();
    });
  });

  const completed = tasks.filter(task => task.done).length;

  $('#taskCount').textContent =
    `${completed}/${tasks.length} concluídas`;
}

function addTask() {
  const input = $('#taskInput');
  const name = input.value.trim();

  if (!name) return;

  state.tasks[selectedDate] ??= [];

  state.tasks[selectedDate].push({
    name,
    done:false
  });

  input.value = '';

  save();
  toast('Tarefa adicionada');
}

$('#addTask').addEventListener('click',addTask);

$('#taskInput').addEventListener('keydown',event => {
  if (event.key === 'Enter') addTask();
});

// ---------------------------------
// MOOD
// ---------------------------------

function renderMood() {
  const mood = state.moods[todayKey];

  const labels = {
    '😞':'Em baixo',
    '😐':'Assim-assim',
    '🙂':'Bem',
    '😁':'Muito bem',
    '🤩':'Excelente'
  };

  $('#moodLabel').textContent = mood
    ? labels[mood]
    : 'Como estás?';

  document.querySelectorAll('.mood').forEach(button => {
    button.classList.toggle(
      'selected',
      button.dataset.mood === mood
    );
  });
}

$('#moods').addEventListener('click',event => {
  const button = event.target.closest('[data-mood]');

  if (!button) return;

  state.moods[todayKey] = button.dataset.mood;
  save();
});

// ---------------------------------
// GYM CARD
// ---------------------------------

function renderGym() {
  const gym = state.habits.find(h => h.id === 'gym');
  const target = gym ? gym.target : 4;

  const count = gym
    ? weekDates().filter(date => isDone('gym',iso(date))).length
    : 0;

  $('#gymCount').textContent = `${count}/${target}`;

  $('#gymPill').textContent =
    count >= target
      ? '✓ Objetivo atingido'
      : `${target-count} treinos em falta`;
}

// ---------------------------------
// HABIT MANAGEMENT
// ---------------------------------

function openModal() {
  editingHabitId = null;

  $('#modalTitle').textContent = 'Gerir hábitos';
  $('#formTitle').textContent = 'Adicionar hábito';

  $('#habitName').value = '';
  $('#habitEmoji').value = '';
  $('#habitTarget').value = 7;

  $('#saveHabit').textContent = 'Guardar hábito';
  $('#cancelEdit').hidden = true;

  renderHabitManagement();

  $('#modal').classList.add('open');
}

function closeModal() {
  $('#modal').classList.remove('open');
  editingHabitId = null;
}

function renderHabitManagement() {
  const container = $('#habitList');

  if (!state.habits.length) {
    container.innerHTML = '<div class="empty">Ainda não existem hábitos.</div>';
    return;
  }

  container.innerHTML = state.habits.map(habit => `
    <div class="habit-item">
      <span class="habit-info">
        ${escapeHTML(habit.emoji || '✨')}
        ${escapeHTML(habit.name)}
        <br>
        <span class="sub">${habit.target} dias por semana</span>
      </span>

      <button data-edit="${escapeHTML(habit.id)}">Editar</button>
      <button class="delete" data-delete="${escapeHTML(habit.id)}">Eliminar</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-edit]').forEach(button => {
    button.addEventListener('click', () => {
      editHabit(button.dataset.edit);
    });
  });

  container.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => {
      deleteHabit(button.dataset.delete);
    });
  });
}

function editHabit(id) {
  const habit = state.habits.find(item => item.id === id);

  if (!habit) return;

  editingHabitId = id;

  $('#modalTitle').textContent = 'Editar hábito';
  $('#formTitle').textContent = 'Alterar informações';

  $('#habitName').value = habit.name;
  $('#habitEmoji').value = habit.emoji || '';
  $('#habitTarget').value = habit.target || 7;

  $('#saveHabit').textContent = 'Guardar alterações';
  $('#cancelEdit').hidden = false;

  $('#habitName').focus();
}

function deleteHabit(id) {
  const habit = state.habits.find(item => item.id === id);

  if (!habit) return;

  const confirmed = confirm(
    `Queres eliminar o hábito "${habit.name}"? O histórico deste hábito também será eliminado.`
  );

  if (!confirmed) return;

  state.habits = state.habits.filter(item => item.id !== id);

  Object.keys(state.done).forEach(date => {
    delete state.done[date][id];
  });

  save();
  renderHabitManagement();

  toast('Hábito eliminado');
}

function saveHabit() {
  const name = $('#habitName').value.trim();
  const emoji = $('#habitEmoji').value.trim() || '✨';
  const target = Math.max(
    1,
    Math.min(7,Number($('#habitTarget').value) || 7)
  );

  if (!name) {
    alert('Introduz o nome do hábito.');
    $('#habitName').focus();
    return;
  }

  if (editingHabitId) {
    const habit = state.habits.find(item => item.id === editingHabitId);

    if (habit) {
      habit.name = name;
      habit.emoji = emoji;
      habit.target = target;
    }

    editingHabitId = null;
    toast('Hábito atualizado');

  } else {
    state.habits.push({
      id:'h' + Date.now(),
      name,
      emoji,
      target
    });

    toast('Hábito adicionado');
  }

  $('#habitName').value = '';
  $('#habitEmoji').value = '';
  $('#habitTarget').value = 7;

  $('#modalTitle').textContent = 'Gerir hábitos';
  $('#formTitle').textContent = 'Adicionar hábito';
  $('#saveHabit').textContent = 'Guardar hábito';
  $('#cancelEdit').hidden = true;

  save();
  renderHabitManagement();
}

$('#settingsBtn').addEventListener('click',openModal);
$('#saveHabit').addEventListener('click',saveHabit);
$('#closeModal').addEventListener('click',closeModal);

$('#cancelEdit').addEventListener('click',() => {
  editingHabitId = null;

  $('#habitName').value = '';
  $('#habitEmoji').value = '';
  $('#habitTarget').value = 7;

  $('#modalTitle').textContent = 'Gerir hábitos';
  $('#formTitle').textContent = 'Adicionar hábito';
  $('#saveHabit').textContent = 'Guardar hábito';
  $('#cancelEdit').hidden = true;
});

$('#habitName').addEventListener('keydown',event => {
  if (event.key === 'Enter') saveHabit();
});

// ---------------------------------
// MONTHLY CALENDAR
// ---------------------------------

function renderCalendar() {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const first = new Date(year,month,1);
  const offset = (first.getDay()+6)%7;
  const days = new Date(year,month+1,0).getDate();

  $('#monthLabel').textContent =
    formatDate(monthDate,{month:'long',year:'numeric'});

  let html = ['S','T','Q','Q','S','S','D']
    .map(day => `<div class="dayhead">${day}</div>`)
    .join('');

  for (let i=0;i<offset;i++) {
    html += '<div class="calday blank"></div>';
  }

  for (let day=1;day<=days;day++) {
    const dateKey = iso(new Date(year,month,day));

    const completed = state.habits.filter(habit =>
      isDone(habit.id,dateKey)
    ).length;

    const percentage = state.habits.length
      ? completed/state.habits.length
      : 0;

    let status = '';

    if (dateKey <= todayKey) {
      if (percentage === 1 && state.habits.length) {
        status = 'full';
      } else if (percentage > 0) {
        status = 'partial';
      }
    }

    html += `
      <button
        class="calday ${status} ${dateKey===selectedDate?'sel':''}"
        data-date="${dateKey}"
        ${dateKey>todayKey?'disabled':''}>
        ${day}
      </button>
    `;
  }

  $('#calGrid').innerHTML = html;

  $('#calGrid').querySelectorAll('[data-date]').forEach(button => {
    button.addEventListener('click',() => {
      selectedDate = button.dataset.date;

      renderCalendar();
      renderTasks();
      renderSelectedDay();
      updateDateLabel();
    });
  });

  renderSelectedDay();
}

function renderSelectedDay() {
  const date = selectedDate;

  const completed = state.habits.filter(habit =>
    isDone(habit.id,date)
  ).length;

  const total = state.habits.length;

  $('#selectedDayInfo').textContent =
    `${formatDate(parseDate(date),{dateStyle:'long'})}: ${completed} de ${total} hábitos concluídos.`;
}

// ---------------------------------
// STATISTICS
// ---------------------------------

function renderStats() {
  const dates = weekDates();

  let total = 0;
  let completed = 0;

  dates.forEach(date => {
    const dateKey = iso(date);

    if (dateKey <= todayKey) {
      state.habits.forEach(habit => {
        total++;

        if (isDone(habit.id,dateKey)) {
          completed++;
        }
      });
    }
  });

  const percentage = total
    ? Math.round(completed/total*100)
    : 0;

  $('#statWeek').textContent = percentage + '%';
  $('#statHabits').textContent = state.habits.length;
  $('#statDone').textContent = completed;

  let streak = 0;
  let date = new Date(today);

  while (true) {
    const dateKey = iso(date);

    if (dateKey > todayKey) break;

    const allDone = state.habits.length > 0 &&
      state.habits.every(habit => isDone(habit.id,dateKey));

    if (!allDone) break;

    streak++;
    date = shiftDate(date,-1);
  }

  $('#statStreak').textContent = streak + ' dias';
}

// ---------------------------------
// NAVIGATION
// ---------------------------------

$('#prevWeek').addEventListener('click',() => {
  weekOffset--;
  render();
});

$('#nextWeek').addEventListener('click',() => {
  if (weekOffset < 0) {
    weekOffset++;
    render();
  }
});

$('#prevMonth').addEventListener('click',() => {
  monthDate = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth()-1,
    1
  );

  renderCalendar();
});

$('#nextMonth').addEventListener('click',() => {
  monthDate = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth()+1,
    1
  );

  renderCalendar();
});

// ---------------------------------
// MENU
// ---------------------------------

document.querySelectorAll('.bottomnav button').forEach(button => {
  button.addEventListener('click',() => {
    document.querySelectorAll('.bottomnav button')
      .forEach(item => item.classList.toggle('active',item===button));

    const view = button.dataset.view;

    if (view === 'calendar') {
      $('#calendar').classList.add('show');
      $('#calendar').scrollIntoView({behavior:'smooth',block:'center'});
    }

    if (view === 'stats') {
      $('#stats').scrollIntoView({behavior:'smooth',block:'center'});
    }

    if (view === 'habits') {
      openModal();
    }

    if (view === 'home') {
      $('#calendar').classList.remove('show');
      window.scrollTo({top:0,behavior:'smooth'});
    }
  });
});

// ---------------------------------
// DATE LABEL
// ---------------------------------

function updateDateLabel() {
  $('#todayLabel').textContent =
    selectedDate === todayKey
      ? formatDate(today,{dateStyle:'full'})
      : formatDate(parseDate(selectedDate),{dateStyle:'full'});
}

// ---------------------------------
// TOAST
// ---------------------------------

function toast(message) {
  const element = $('#toast');

  element.textContent = message;
  element.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    element.classList.remove('show');
  },1800);
}

// ---------------------------------
// BACKUP AND RESTORE
// ---------------------------------

function exportBackup() {
  const backup = {
    app: 'Habit Tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `habit-tracker-backup-${date}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  toast('Backup exportado com sucesso');
}

function importBackup(event) {
  const file = event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);

      if (
        backup.app !== 'Habit Tracker' ||
        backup.version !== 1 ||
        !backup.data ||
        !Array.isArray(backup.data.habits) ||
        typeof backup.data.done !== 'object' ||
        backup.data.done === null ||
        typeof backup.data.tasks !== 'object' ||
        backup.data.tasks === null ||
        typeof backup.data.moods !== 'object' ||
        backup.data.moods === null
      ) {
        throw new Error('Formato de backup inválido.');
      }

      const validHabits = backup.data.habits.every(habit =>
        habit &&
        typeof habit.id === 'string' &&
        typeof habit.name === 'string'
      );

      if (!validHabits) {
        throw new Error('Os hábitos do backup são inválidos.');
      }

      const confirmed = confirm(
        'Queres restaurar este backup?\n\n' +
        'Os dados atuais deste dispositivo serão substituídos.'
      );

      if (!confirmed) {
        event.target.value = '';
        return;
      }

      state = {
        habits: backup.data.habits.map(habit => ({
          ...habit,
          target: Math.min(7, Math.max(1, Number(habit.target) || 7))
        })),
        done: backup.data.done,
        tasks: backup.data.tasks,
        moods: backup.data.moods
      };

      localStorage.setItem('habittracker-v1', JSON.stringify(state));
      localStorage.setItem('dailyflow-v1', JSON.stringify(state));

      toast('Backup restaurado com sucesso');

      render();
      renderHabitManagement();

      event.target.value = '';

    } catch (error) {
      alert(
        'Não foi possível importar o backup.\n' +
        'Verifica se selecionaste um ficheiro válido.'
      );

      console.error('Erro ao importar backup:', error);
      event.target.value = '';
    }
  };

  reader.onerror = () => {
    alert('Não foi possível ler o ficheiro.');
    event.target.value = '';
  };

  reader.readAsText(file);
}

$('#exportBackup').addEventListener('click', exportBackup);

$('#importBackup').addEventListener('click', () => {
  $('#backupFile').click();
});

$('#backupFile').addEventListener('change', importBackup);

// ---------------------------------
// MAIN RENDER
// ---------------------------------

function render() {
  updateDateLabel();
  renderWeek();
  renderTasks();
  renderMood();
  renderGym();
  renderCalendar();
  renderStats();
}

// ---------------------------------
// ONESIGNAL NOTIFICATIONS
// ---------------------------------

function setupNotificationButton() {
  const settingsButton = $('#settingsBtn');

  if (!settingsButton || $('#notificationBtn')) return;

  const button = document.createElement('button');
  button.id = 'notificationBtn';
  button.className = 'iconbtn';
  button.type = 'button';
  button.textContent = '🔔';
  button.setAttribute('aria-label', 'Ativar notificações');
  button.title = 'Ativar notificações';
  button.style.marginRight = '8px';

  settingsButton.parentNode.insertBefore(button, settingsButton);

  button.addEventListener('click', () => {
    if (!('Notification' in window)) {
      toast('Este navegador não suporta notificações.');
      return;
    }

    if (!window.OneSignalDeferred) {
      toast('OneSignal ainda não está carregado.');
      return;
    }

    button.disabled = true;
    button.textContent = '…';

    window.OneSignalDeferred.push(async OneSignal => {
      try {
        await OneSignal.Notifications.requestPermission();

        if (Notification.permission === 'granted') {
          await OneSignal.User.PushSubscription.optIn();

          button.textContent = '🔔';
          button.title = 'Notificações ativadas';

          toast('Notificações ativadas!');
        } else if (Notification.permission === 'denied') {
          button.textContent = '🔕';
          button.title = 'Notificações bloqueadas nas definições';

          toast('Permissão bloqueada. Ativa-a nas definições do iPhone.');
        } else {
          button.textContent = '🔔';
          toast('Ainda não autorizaste as notificações.');
        }
      } catch (error) {
        console.error('Erro ao ativar notificações:', error);

        button.textContent = '🔔';
        toast('Não foi possível ativar as notificações.');
      } finally {
        button.disabled = false;
      }
    });
  });
}

// ---------------------------------
// INITIALIZATION
// ---------------------------------

setupNotificationButton();
render();
