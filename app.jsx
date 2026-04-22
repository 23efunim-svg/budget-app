const { useState, useEffect, useMemo, useRef } = React;
const { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } = Recharts;

// ============== FIREBASE ==============
const firebaseConfig = {
  apiKey: "AIzaSyCG2zUK66HOdf9FgbQvQUFEMvXJ8tP2Pm8",
  authDomain: "rolgrad-budget.firebaseapp.com",
  projectId: "rolgrad-budget",
  storageBucket: "rolgrad-budget.firebasestorage.app",
  messagingSenderId: "761530108423",
  appId: "1:761530108423:web:dcdce853a5a768e3b2b8a2",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

const HOUSEHOLD_KEY = 'household_code_v1';
const loadHousehold = () => localStorage.getItem(HOUSEHOLD_KEY);
const saveHousehold = (code) => localStorage.setItem(HOUSEHOLD_KEY, code);
const clearHousehold = () => localStorage.removeItem(HOUSEHOLD_KEY);

// Генератор семейного кода: 12 символов без похожих (I, O, 0, 1), разбитых на 3 блока по 4
const genHouseholdCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < 12; i++) s += alphabet[arr[i] % alphabet.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
};

const normalizeCode = (raw) => (raw || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 12);
const formatCode = (raw) => {
  const n = normalizeCode(raw);
  return [n.slice(0, 4), n.slice(4, 8), n.slice(8, 12)].filter(Boolean).join('-');
};
const isValidCode = (raw) => normalizeCode(raw).length === 12;

// ============== ИСХОДНЫЕ ДАННЫЕ ==============
const DEFAULT_STATE = {
  version: 2,
  month: '2026-05',
  startCash: 36000,
  plannedIncome: 238000,
  actualIncome: 0,
  incomes: [], // [{id, date, amount, source}]
  aprilTail: [
    { id: 'at1', name: 'Долг близкому', sum: 4000, paid: false },
    { id: 'at2', name: 'Садик ребёнку', sum: 1000, paid: false },
    { id: 'at3', name: 'Подарок учителю', sum: 1000, paid: false },
    { id: 'at4', name: 'Нужды класса', sum: 1000, paid: false },
    { id: 'at5', name: 'Одежда в садик', sum: 1000, paid: false },
    { id: 'at6', name: 'Подарок ребёнку (ДР)', sum: 2000, paid: false },
    { id: 'at7', name: 'Угощения на ДР', sum: 2000, paid: false },
    { id: 'at8', name: 'Стоматолог детям', sum: 6000, paid: false },
    { id: 'at9', name: 'Репетитор', sum: 2000, paid: false },
    { id: 'at10', name: 'Бензин', sum: 2000, paid: false },
    { id: 'at11', name: 'Продукты', sum: 6000, paid: false },
  ],
  groups: [
    {
      id: 'housing', name: 'Жильё и быт', icon: 'home', color: '#5D737E',
      items: [
        { id: 'h1', name: 'Аренда жилья', planned: 17000, actual: 0, paid: false },
        { id: 'h2', name: 'ЖКХ (долг + текущий)', planned: 25000, actual: 0, paid: false },
        { id: 'h3', name: 'Интернет и связь', planned: 1500, actual: 0, paid: false },
      ],
    },
    {
      id: 'debts', name: 'Долги', icon: 'card', color: '#C1432E',
      items: [
        { id: 'd1', name: 'Долг близкому', planned: 5000, actual: 0, paid: false },
        { id: 'd2', name: 'Долг ребёнку', planned: 6000, actual: 0, paid: false },
        { id: 'd3', name: 'Доп. погашение', planned: 15000, actual: 0, paid: false },
      ],
    },
    {
      id: 'food', name: 'Еда и быт', icon: 'cart', color: '#8B9A4B',
      items: [
        { id: 'f1', name: 'Продукты', planned: 40000, actual: 0 },
        { id: 'f2', name: 'Хозтовары + бытхимия', planned: 6000, actual: 0 },
        { id: 'f3', name: 'Аптека', planned: 5000, actual: 0 },
      ],
    },
    {
      id: 'kids', name: 'Дети', icon: 'baby', color: '#7A9E7E',
      items: [
        { id: 'k1', name: 'Садик + кружки', planned: 3000, actual: 0, paid: false },
        { id: 'k2', name: 'Репетитор английского', planned: 4000, actual: 0, paid: false },
        { id: 'k3', name: 'Выпускной в школе', planned: 4000, actual: 0, paid: false },
        { id: 'k4', name: 'Одежда на выпускной', planned: 2000, actual: 0, paid: false },
        { id: 'k5', name: 'Обеды в школе', planned: 4000, actual: 0 },
        { id: 'k6', name: 'Школьный лагерь', planned: 6000, actual: 0, paid: false },
        { id: 'k7', name: 'Стоматолог ребёнку', planned: 5000, actual: 0, paid: false },
      ],
    },
    {
      id: 'gifts', name: 'Подарки', icon: 'gift', color: '#D4A574',
      items: [
        { id: 'g1', name: 'ДР родственников', planned: 10000, actual: 0, paid: false },
        { id: 'g2', name: 'Подарок пастору', planned: 10000, actual: 0, paid: false },
        { id: 'g3', name: 'ДР друга', planned: 2000, actual: 0, paid: false },
        { id: 'g4', name: 'ДР друга ребёнка', planned: 1500, actual: 0, paid: false },
        { id: 'g5', name: 'Благословение', planned: 1000, actual: 0 },
      ],
    },
    {
      id: 'moscow', name: 'Москва (конфа)', icon: 'plane', color: '#B87333',
      items: [
        { id: 'm1', name: 'Еда/гулянки конфа', planned: 10500, actual: 0 },
        { id: 'm2', name: 'Еда в дороге', planned: 6000, actual: 0 },
        { id: 'm3', name: 'Ночёвка туда-обратно', planned: 5000, actual: 0, paid: false },
        { id: 'm4', name: 'Оставить дома (еда)', planned: 5000, actual: 0, paid: false },
      ],
    },
    {
      id: 'transport', name: 'Транспорт', icon: 'car', color: '#6B7280',
      items: [
        { id: 't1', name: 'Бензин', planned: 6000, actual: 0 },
        { id: 't2', name: 'Маршрутки', planned: 3500, actual: 0 },
      ],
    },
    {
      id: 'personal', name: 'Личное', icon: 'heart', color: '#C38D9E',
      items: [
        { id: 'p1', name: 'Гулянки с детьми + свидания', planned: 6000, actual: 0 },
        { id: 'p2', name: 'Личное (кофе и пр.)', planned: 3000, actual: 0 },
        { id: 'p3', name: 'Нейросети', planned: 3000, actual: 0 },
        { id: 'p4', name: 'Спортзал', planned: 2000, actual: 0, paid: false },
        { id: 'p5', name: 'Ногти', planned: 1700, actual: 0, paid: false },
      ],
    },
    {
      id: 'savings', name: 'Резервы и накопления', icon: 'piggy', color: '#41B3A3',
      items: [
        { id: 's1', name: 'Подушка (вклад 14%)', planned: 5000, actual: 0, paid: false },
        { id: 's2', name: 'Резервный фонд', planned: 3000, actual: 0, paid: false },
        { id: 's3', name: 'Буфер на школу', planned: 3000, actual: 0 },
        { id: 's4', name: 'Резерв на одежду', planned: 2000, actual: 0, paid: false },
      ],
    },
  ],
  savedPots: [
    { id: 'pot1', name: 'Подушка безопасности', target: 330000, current: 0, note: '3-6 месяцев расходов' },
    { id: 'pot2', name: 'Резервный фонд', target: 20000, current: 0, note: 'на поломки' },
    { id: 'pot3', name: 'Резерв одежды', target: 20000, current: 0, note: 'школа + зима' },
  ],
  activeDebts: [
    { id: 'debt1', name: 'Долг близкому', total: 5000, paid: 0, note: '' },
    { id: 'debt2', name: 'Долг ребёнку', total: 6000, paid: 0, note: 'с подаренного на ДР' },
    { id: 'debt3', name: 'ЖКХ просрочка', total: 20000, paid: 0, note: '2 месяца' },
  ],
  categoryMapping: {
    // Маппинг категорий Zenmoney CSV → наши группы
    'Продукты': 'food',
    'Хозтовары': 'food',
    'Аптека': 'food',
    'Аренда жилья': 'housing',
    'Софт, связь, подписки': 'housing',
    'Дети': 'kids',
    'Образование': 'kids',
    'Подарки': 'gifts',
    'Благословения': 'gifts',
    'Поездки': 'moscow',
    'Бензин': 'transport',
    'Транспорт': 'transport',
    'Машина': 'transport',
    'Кафе и рестораны': 'personal',
    'Сладости': 'personal',
    'Напитки': 'personal',
    'Чипсы / кола': 'personal',
    'Забота о себе': 'personal',
    'Отдых и развлечения': 'personal',
    'К чаю на встречи': 'personal',
    'Одежда': 'savings',
    'Долг': 'debts',
    'Оплата за других': 'food',
    'Еда на работе': 'personal',
    'Покупки': 'personal',
  },
};

// ============== УТИЛИТЫ ==============
const STORAGE_KEY = 'family_budget_v2';

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    // Миграция: если нет новых полей — дополняем из DEFAULT
    return { ...DEFAULT_STATE, ...parsed };
  } catch (e) {
    return DEFAULT_STATE;
  }
};

const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Save failed', e);
  }
};

const fmt = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const fmtShort = (n) => {
  if (n >= 1000) return (Math.round(n / 100) / 10).toString().replace('.', ',') + 'к';
  return Math.round(n).toString();
};
const uid = () => Math.random().toString(36).slice(2, 10);

// ============== ИКОНКИ (SVG) ==============
const Icon = ({ name, size = 20, color = 'currentColor' }) => {
  const paths = {
    home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z',
    card: 'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 11h20',
    cart: 'M3 3h2l2.4 12.5a2 2 0 0 0 2 1.5h9.2a2 2 0 0 0 2-1.5L23 6H6',
    baby: 'M9 12h.01M15 12h.01M10 16s1 1 2 1 2-1 2-1M17 18a5 5 0 0 1-10 0M12 2v2M4.93 4.93l1.41 1.41M1 12h2M19 12h2M19.07 4.93l-1.41 1.41',
    gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    plane: 'M17.8 19.8L6.6 14l-3.2 3.2 4.6 2.6-1.7 2.3L7 22l5-3 2 3 2-1-1.5-5.3 4.7 2.5z',
    car: 'M3 17h2l1-5h12l1 5h2M5 12l2-5h10l2 5M7 17a2 2 0 1 1-4 0M21 17a2 2 0 1 1-4 0',
    heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
    piggy: 'M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-7.5-1.5-10 .5C4 8.5 3 10 3 12c0 1.5.5 3 2 4v3h3v-2h6v2h3v-3c1-.7 1.5-1.5 2-2.5h2v-4h-2c-.5-1-1-2-2-2.5-1-.5-.5-2 0-2zM16 10.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z',
    chart: 'M3 3v18h18M7 16V9M12 16V6M17 16v-4',
    calendar: 'M3 10h18M8 3v4M16 3v4M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
    plus: 'M12 5v14M5 12h14',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    check: 'M20 6L9 17l-5-5',
    close: 'M18 6L6 18M6 6l12 12',
    trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    sparkles: 'M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2zM19 3v4M21 5h-4M19 17v4M21 19h-4',
    trending: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
    info: 'M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10zM12 16v-4M12 8h.01',
    alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
    copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  };
  const p = paths[name] || paths.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {p.split('M').filter(Boolean).map((d, i) => <path key={i} d={'M' + d} />)}
    </svg>
  );
};

// ============== ОСНОВНОЙ КОМПОНЕНТ ==============
function App({ householdCode, onLeaveHousehold }) {
  const [state, setState] = useState(loadState());
  const [tab, setTab] = useState('home');
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null); // {type, data}
  const [toast, setToast] = useState(null);
  const [syncStatus, setSyncStatus] = useState('connecting'); // connecting | synced | offline | error
  const lastRemoteJsonRef = useRef(null); // JSON того, что последний раз пришло из Firestore — чтобы не гонять эхо

  // Автосохранение локально (fallback если нет сети)
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Подписка на Firestore: получаем state от других устройств в реальном времени
  useEffect(() => {
    if (!householdCode) return;
    const docRef = db.collection('households').doc(householdCode);
    const unsub = docRef.onSnapshot(
      (snap) => {
        if (!snap.exists) {
          // Документ ещё не создан — создаём с текущим локальным state
          const json = JSON.stringify(state);
          lastRemoteJsonRef.current = json;
          docRef.set({ state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
          setSyncStatus('synced');
          return;
        }
        const data = snap.data();
        if (!data || !data.state) return;
        const incomingJson = JSON.stringify(data.state);
        if (incomingJson === lastRemoteJsonRef.current) {
          setSyncStatus('synced');
          return;
        }
        lastRemoteJsonRef.current = incomingJson;
        setState({ ...DEFAULT_STATE, ...data.state });
        setSyncStatus('synced');
      },
      (err) => {
        console.warn('Firestore subscribe error', err);
        setSyncStatus('error');
      }
    );
    return unsub;
  }, [householdCode]);

  // Debounced запись локальных изменений в Firestore
  useEffect(() => {
    if (!householdCode) return;
    const json = JSON.stringify(state);
    if (json === lastRemoteJsonRef.current) return; // пришло оттуда же — не пушим обратно
    setSyncStatus('connecting');
    const t = setTimeout(() => {
      lastRemoteJsonRef.current = json;
      db.collection('households').doc(householdCode)
        .set({ state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => setSyncStatus('synced'))
        .catch((err) => { console.warn('Firestore write error', err); setSyncStatus('offline'); });
    }, 500);
    return () => clearTimeout(t);
  }, [state, householdCode]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // ========== Вычисления ==========
  const planTotal = useMemo(() =>
    state.groups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.planned, 0), 0),
    [state.groups]
  );
  const actualTotal = useMemo(() =>
    state.groups.reduce((s, g) => s + g.items.reduce((a, i) => a + (i.actual || 0), 0), 0),
    [state.groups]
  );
  const aprilTailTotal = useMemo(() =>
    state.aprilTail.filter(i => !i.paid).reduce((s, i) => s + i.sum, 0),
    [state.aprilTail]
  );
  const aprilTailPaid = useMemo(() =>
    state.aprilTail.filter(i => i.paid).reduce((s, i) => s + i.sum, 0),
    [state.aprilTail]
  );

  const totalActualIncome = useMemo(() =>
    state.incomes.reduce((s, i) => s + i.amount, 0),
    [state.incomes]
  );

  const available = state.startCash - aprilTailPaid + (state.plannedIncome);
  const surplus = available - planTotal;
  const spent = actualTotal;
  const remaining = planTotal - spent;
  const spentPct = planTotal > 0 ? Math.round((spent / planTotal) * 100) : 0;

  // ========== Операции над состоянием ==========
  const updateItem = (groupId, itemId, updates) => {
    setState(s => ({
      ...s,
      groups: s.groups.map(g => g.id === groupId ? {
        ...g,
        items: g.items.map(i => i.id === itemId ? { ...i, ...updates } : i),
      } : g),
    }));
  };
  const addItem = (groupId, item) => {
    setState(s => ({
      ...s,
      groups: s.groups.map(g => g.id === groupId ? {
        ...g,
        items: [...g.items, { id: uid(), actual: 0, paid: false, ...item }],
      } : g),
    }));
  };
  const deleteItem = (groupId, itemId) => {
    setState(s => ({
      ...s,
      groups: s.groups.map(g => g.id === groupId ? {
        ...g,
        items: g.items.filter(i => i.id !== itemId),
      } : g),
    }));
  };
  const toggleAprilTail = (id) => {
    setState(s => ({
      ...s,
      aprilTail: s.aprilTail.map(i => i.id === id ? { ...i, paid: !i.paid } : i),
    }));
  };
  const addIncome = (amount, source) => {
    setState(s => ({
      ...s,
      incomes: [...s.incomes, { id: uid(), date: new Date().toISOString(), amount, source }],
    }));
  };
  const updatePot = (id, updates) => {
    setState(s => ({
      ...s,
      savedPots: s.savedPots.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  };
  const updateDebt = (id, updates) => {
    setState(s => ({
      ...s,
      activeDebts: s.activeDebts.map(d => d.id === id ? { ...d, ...updates } : d),
    }));
  };
  const addPot = (pot) => {
    setState(s => ({ ...s, savedPots: [...s.savedPots, { id: uid(), ...pot }] }));
  };
  const deletePot = (id) => {
    setState(s => ({ ...s, savedPots: s.savedPots.filter(p => p.id !== id) }));
  };

  // ========== CSV Import / Export ==========
  const parseCSV = (text) => {
    // Парсим CSV Zenmoney: разделитель ;, первая строка — заголовок
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV пустой');
    const header = lines[0].replace(/^\uFEFF/, '').split(';').map(h => h.replace(/"/g, '').trim());
    const idx = {
      date: header.indexOf('date'),
      category: header.indexOf('categoryName'),
      outcome: header.indexOf('outcome'),
      income: header.indexOf('income'),
    };
    if (idx.date === -1 || idx.outcome === -1) throw new Error('Не нашли нужные колонки (date, outcome)');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';').map(p => p.replace(/^"|"$/g, ''));
      const date = parts[idx.date];
      const cat = parts[idx.category] || '';
      const out = parseFloat(parts[idx.outcome]) || 0;
      const inc = parseFloat(parts[idx.income]) || 0;
      rows.push({ date, cat, outcome: out, income: inc });
    }
    return rows;
  };

  const handleCSVImport = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = parseCSV(e.target.result);
        const monthPrefix = state.month; // '2026-05'
        // Берём только текущий месяц и только расходы (без переводов)
        const relevant = rows.filter(r =>
          r.date && r.date.startsWith(monthPrefix) && r.outcome > 0 && r.income === 0
        );
        // Агрегируем по нашим группам через маппинг
        const actualByGroup = {};
        relevant.forEach(r => {
          const groupId = state.categoryMapping[r.cat];
          if (groupId) {
            actualByGroup[groupId] = (actualByGroup[groupId] || 0) + r.outcome;
          }
        });
        // Обновляем состояние: распределяем актуал внутри группы пропорционально плану
        setState(s => ({
          ...s,
          groups: s.groups.map(g => {
            const groupActual = actualByGroup[g.id] || 0;
            const groupPlan = g.items.reduce((a, i) => a + i.planned, 0);
            return {
              ...g,
              items: g.items.map(it => {
                const share = groupPlan > 0 ? it.planned / groupPlan : 0;
                return { ...it, actual: Math.round(groupActual * share) };
              }),
            };
          }),
        }));
        showToast(`Импортировано: ${relevant.length} операций`);
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const exportJSON = () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-${state.month}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Экспортировано');
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        setState({ ...DEFAULT_STATE, ...parsed });
        showToast('Данные загружены');
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const resetAll = () => {
    if (confirm('Сбросить все данные на первоначальные? Это удалит все изменения.')) {
      setState(DEFAULT_STATE);
      showToast('Сброшено к стандарту');
    }
  };

  // ========== РЕНДЕР ==========
  return (
    <div className="min-h-screen paper pb-24 safe-top">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 backdrop-blur-lg bg-amber-50/90 border-b border-stone-200 px-4 py-3 safe-top">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-[10px] tracking-[0.25em] text-stone-500 mono flex items-center gap-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                  syncStatus === 'synced' ? 'bg-emerald-500' :
                  syncStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
                  syncStatus === 'offline' ? 'bg-stone-400' : 'bg-rose-500'
                }`} title={{synced:'синхронизировано', connecting:'синхронизация…', offline:'офлайн', error:'ошибка связи'}[syncStatus]}></span>
                БЮДЖЕТ · МАЙ 2026
              </div>
              <div className="text-lg font-bold leading-tight">
                {tab === 'home' && 'Главная'}
                {tab === 'plan' && 'План расходов'}
                {tab === 'pots' && 'Копилки и долги'}
                {tab === 'sync' && 'Синхронизация'}
                {tab === 'settings' && 'Настройки'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] tracking-widest text-stone-500 mono">ОСТАТОК ПО ПЛАНУ</div>
            <div className={`text-lg font-black numeric ${remaining < 0 ? 'text-rose-700' : 'text-stone-900'}`}>
              {fmt(remaining)}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pt-4 slideup">
        {tab === 'home' && (
          <HomeTab
            state={state}
            setState={setState}
            planTotal={planTotal}
            actualTotal={actualTotal}
            surplus={surplus}
            available={available}
            aprilTailTotal={aprilTailTotal}
            aprilTailPaid={aprilTailPaid}
            toggleAprilTail={toggleAprilTail}
            spentPct={spentPct}
            setModal={setModal}
          />
        )}
        {tab === 'plan' && (
          <PlanTab
            state={state}
            expanded={expanded}
            setExpanded={setExpanded}
            updateItem={updateItem}
            addItem={addItem}
            deleteItem={deleteItem}
            planTotal={planTotal}
            actualTotal={actualTotal}
            setModal={setModal}
          />
        )}
        {tab === 'pots' && (
          <PotsTab
            state={state}
            updatePot={updatePot}
            updateDebt={updateDebt}
            addPot={addPot}
            deletePot={deletePot}
            setModal={setModal}
          />
        )}
        {tab === 'sync' && (
          <SyncTab
            handleCSVImport={handleCSVImport}
            exportJSON={exportJSON}
            importJSON={importJSON}
            state={state}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            state={state}
            setState={setState}
            resetAll={resetAll}
            showToast={showToast}
            householdCode={householdCode}
            onLeaveHousehold={onLeaveHousehold}
            syncStatus={syncStatus}
          />
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-amber-50/95 backdrop-blur-lg border-t border-stone-200 px-2 py-2 safe-bottom">
        <div className="max-w-2xl mx-auto grid grid-cols-5 gap-1">
          <TabBtn id="home" label="Главная" icon="home" active={tab} setActive={setTab} />
          <TabBtn id="plan" label="План" icon="chart" active={tab} setActive={setTab} />
          <TabBtn id="pots" label="Копилки" icon="piggy" active={tab} setActive={setTab} />
          <TabBtn id="sync" label="Синхро" icon="upload" active={tab} setActive={setTab} />
          <TabBtn id="settings" label="⚙" icon="settings" active={tab} setActive={setTab} />
        </div>
      </nav>

      {/* Модалки */}
      {modal && (
        <Modal modal={modal} setModal={setModal} state={state} setState={setState}
               updateItem={updateItem} addItem={addItem} deleteItem={deleteItem}
               showToast={showToast} />
      )}

      {/* Тост */}
      {toast && (
        <div className="fixed bottom-24 left-4 right-4 z-40 fadein">
          <div className={`max-w-sm mx-auto rounded-2xl px-5 py-3 text-center shadow-xl ${
            toast.type === 'error' ? 'bg-rose-800 text-amber-50' : 'bg-stone-900 text-amber-50'
          }`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== HOME TAB ==============
function HomeTab({ state, planTotal, actualTotal, surplus, available, aprilTailTotal, aprilTailPaid, toggleAprilTail, spentPct, setModal }) {
  const groupTotals = state.groups.map(g => ({
    ...g,
    planned: g.items.reduce((s, i) => s + i.planned, 0),
    actual: g.items.reduce((s, i) => s + (i.actual || 0), 0),
  }));

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="paper rounded-3xl p-6 border border-stone-200 relative overflow-hidden">
        <div className="absolute -top-6 -right-4 text-[140px] font-black text-stone-100/80 select-none leading-none">V</div>
        <div className="relative">
          <div className="text-[10px] tracking-[0.3em] text-stone-500 mono mb-1">MAY · 2026</div>
          <h1 className="text-4xl font-black leading-[0.95]">План <em className="italic font-light text-rose-800">на месяц</em></h1>
          <div className="mt-4 flex items-baseline gap-3">
            <div>
              <div className="text-xs text-stone-500">Потрачено</div>
              <div className="text-2xl font-black numeric">{fmt(actualTotal)}</div>
            </div>
            <div className="text-stone-400 text-2xl">/</div>
            <div>
              <div className="text-xs text-stone-500">Запланировано</div>
              <div className="text-2xl font-black numeric text-stone-600">{fmt(planTotal)}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: Math.min(100, spentPct) + '%',
                  background: spentPct > 100 ? '#dc2626' : spentPct > 80 ? '#d97706' : '#059669',
                }}
              />
              {spentPct > 100 && <div className="progress-over" style={{ width: Math.min(30, spentPct - 100) + '%' }} />}
            </div>
            <div className="flex justify-between mt-1 text-[11px] text-stone-500">
              <span>{spentPct}% месяца</span>
              <span>{fmt(planTotal - actualTotal)} осталось</span>
            </div>
          </div>
        </div>
      </div>

      {/* Math */}
      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">МАТЕМАТИКА</div>
        <div className="space-y-2">
          <MathRow label="На руках на старте" val={fmt(state.startCash)} />
          <MathRow label="− хвост апреля (оплачено)" val={'−' + fmt(aprilTailPaid)} neg />
          <MathRow label="+ планируемый доход" val={'+' + fmt(state.plannedIncome)} pos />
          <div className="rule my-2" />
          <MathRow label="Доступно" val={fmt(available)} bold />
          <MathRow label="− план расходов" val={'−' + fmt(planTotal)} neg />
          <div className="rule my-2" />
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-sm font-medium">Профицит</span>
            <span className={`text-xl font-black numeric ${surplus >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              {surplus >= 0 ? '+' : ''}{fmt(surplus)}
            </span>
          </div>
        </div>
      </div>

      {/* Груп-прогрессы */}
      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs tracking-widest mono text-stone-500">ПЛАН vs ФАКТ</div>
          <span className="text-[10px] mono text-stone-400">по категориям</span>
        </div>
        <div className="space-y-4">
          {groupTotals.map(g => {
            const pct = g.planned > 0 ? Math.round((g.actual / g.planned) * 100) : 0;
            const over = g.actual > g.planned;
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: g.color + '22' }}>
                      <Icon name={g.icon} size={14} color={g.color} />
                    </div>
                    <span className="text-sm font-medium">{g.name}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm numeric mono font-bold ${over ? 'text-rose-700' : 'text-stone-900'}`}>
                      {fmtShort(g.actual)}
                    </span>
                    <span className="text-xs text-stone-400 numeric mono"> / {fmtShort(g.planned)}</span>
                  </div>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{
                    width: Math.min(100, pct) + '%',
                    background: over ? '#dc2626' : pct > 80 ? '#d97706' : g.color,
                  }} />
                  {over && <div className="progress-over" style={{ width: Math.min(30, pct - 100) + '%' }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Хвост апреля */}
      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs tracking-widest mono text-stone-500">ХВОСТ АПРЕЛЯ</div>
            <div className="font-bold">
              Осталось: <span className="text-rose-800 numeric">{fmt(aprilTailTotal)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] mono text-stone-400">Оплачено</div>
            <div className="numeric font-bold text-emerald-800">{fmt(aprilTailPaid)}</div>
          </div>
        </div>
        <div className="space-y-1">
          {state.aprilTail.map(it => (
            <button
              key={it.id}
              onClick={() => toggleAprilTail(it.id)}
              className="tap w-full flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-stone-100/50 transition"
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
                it.paid ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'
              }`}>
                {it.paid && <Icon name="check" size={12} color="white" />}
              </div>
              <span className={`flex-1 text-left text-sm ${it.paid ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                {it.name}
              </span>
              <span className={`numeric mono text-sm ${it.paid ? 'text-stone-400' : 'font-medium'}`}>
                {fmt(it.sum)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Pie */}
      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">СТРУКТУРА ПЛАНА</div>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={groupTotals} dataKey="planned" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={105} paddingAngle={2}>
              {groupTotals.map(g => <Cell key={g.id} fill={g.color} />)}
            </Pie>
            <Tooltip formatter={v => fmt(v)} contentStyle={{ fontFamily: 'Fraunces', borderRadius: 12, border: '1px solid #d6d3d1' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 gap-1.5 mt-2 text-xs">
          {groupTotals.map(g => (
            <div key={g.id} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: g.color }} />
              <span className="text-stone-700 truncate">{g.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============== PLAN TAB ==============
function PlanTab({ state, expanded, setExpanded, updateItem, addItem, deleteItem, planTotal, actualTotal, setModal }) {
  const toggle = (id) => setExpanded(s => ({ ...s, [id]: !s[id] }));

  return (
    <div className="space-y-3">
      <div className="paper rounded-2xl p-5 border border-stone-200 mb-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs tracking-widest mono text-stone-500">ВСЕГО ПЛАН / ФАКТ</div>
            <div className="text-2xl font-black numeric">{fmt(actualTotal)} <span className="text-stone-400 text-lg">/ {fmt(planTotal)}</span></div>
          </div>
          <div className="text-right">
            <div className="text-xs tracking-widest mono text-stone-500">ОСТАТОК</div>
            <div className={`text-xl font-bold numeric ${planTotal - actualTotal < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
              {fmt(planTotal - actualTotal)}
            </div>
          </div>
        </div>
      </div>

      {state.groups.map(g => {
        const planned = g.items.reduce((s, i) => s + i.planned, 0);
        const actual = g.items.reduce((s, i) => s + (i.actual || 0), 0);
        const pct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
        const isOpen = expanded[g.id];
        return (
          <div key={g.id} className="paper rounded-2xl border border-stone-200 overflow-hidden">
            <button onClick={() => toggle(g.id)} className="w-full tap p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: g.color + '22' }}>
                    <Icon name={g.icon} size={18} color={g.color} />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{g.name}</div>
                    <div className="text-xs text-stone-500">{g.items.length} позиций · {pct}%</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="numeric mono font-bold">{fmt(actual)}</div>
                  <div className="numeric mono text-xs text-stone-400">/ {fmt(planned)}</div>
                </div>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{
                  width: Math.min(100, pct) + '%',
                  background: actual > planned ? '#dc2626' : pct > 80 ? '#d97706' : g.color,
                }} />
                {actual > planned && <div className="progress-over" style={{ width: Math.min(30, pct - 100) + '%' }} />}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-2 border-t border-stone-100 pt-3 fadein">
                {g.items.map(it => (
                  <ItemRow key={it.id} item={it} groupId={g.id} updateItem={updateItem}
                          deleteItem={deleteItem} setModal={setModal} />
                ))}
                <button
                  onClick={() => setModal({ type: 'addItem', data: { groupId: g.id } })}
                  className="tap w-full mt-2 py-2 border-2 border-dashed border-stone-300 rounded-xl text-sm text-stone-500 flex items-center justify-center gap-1 hover:bg-stone-50"
                >
                  <Icon name="plus" size={14} /> Добавить позицию
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({ item, groupId, updateItem, deleteItem, setModal }) {
  const over = item.actual > item.planned;
  const pct = item.planned > 0 ? Math.round(((item.actual || 0) / item.planned) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-stone-50">
      {'paid' in item && (
        <button
          onClick={(e) => { e.stopPropagation(); updateItem(groupId, item.id, { paid: !item.paid }); }}
          className={`tap w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition ${
            item.paid ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'
          }`}
        >
          {item.paid && <Icon name="check" size={12} color="white" />}
        </button>
      )}
      <button
        onClick={() => setModal({ type: 'editItem', data: { groupId, item } })}
        className="flex-1 min-w-0 text-left"
      >
        <div className={`text-sm truncate ${item.paid ? 'line-through text-stone-400' : 'text-stone-800'}`}>
          {item.name}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex-1 h-1 rounded-full bg-stone-200 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              width: Math.min(100, pct) + '%',
              background: over ? '#dc2626' : pct > 80 ? '#d97706' : '#059669',
            }} />
          </div>
          <span className={`text-xs numeric mono ${over ? 'text-rose-700' : 'text-stone-500'}`}>
            {fmtShort(item.actual || 0)}/{fmtShort(item.planned)}
          </span>
        </div>
      </button>
    </div>
  );
}

// ============== POTS TAB ==============
function PotsTab({ state, updatePot, updateDebt, addPot, deletePot, setModal }) {
  return (
    <div className="space-y-4">
      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">КОПИЛКИ</div>
        <div className="space-y-3">
          {state.savedPots.map(p => {
            const pct = p.target > 0 ? Math.round((p.current / p.target) * 100) : 0;
            return (
              <div key={p.id} className="p-4 rounded-xl border border-stone-200 bg-gradient-to-br from-emerald-50/40 to-amber-50/40">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{p.name}</div>
                    {p.note && <div className="text-xs text-stone-500 mt-0.5">{p.note}</div>}
                  </div>
                  <button onClick={() => setModal({ type: 'editPot', data: p })} className="tap text-stone-500 p-1">
                    <Icon name="edit" size={16} />
                  </button>
                </div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xl font-black numeric text-emerald-800">{fmt(p.current)}</span>
                  <span className="text-sm text-stone-500 numeric">/ {fmt(p.target)}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{
                    width: Math.min(100, pct) + '%',
                    background: '#059669',
                  }} />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setModal({ type: 'potAdd', data: p })}
                    className="tap flex-1 text-xs py-1.5 px-3 rounded-lg bg-emerald-600 text-white font-medium"
                  >
                    + Пополнить
                  </button>
                  <button
                    onClick={() => setModal({ type: 'potWithdraw', data: p })}
                    className="tap flex-1 text-xs py-1.5 px-3 rounded-lg bg-stone-200 text-stone-700 font-medium"
                  >
                    − Взять
                  </button>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => setModal({ type: 'addPot' })}
            className="tap w-full py-3 border-2 border-dashed border-stone-300 rounded-xl text-sm text-stone-500 flex items-center justify-center gap-1"
          >
            <Icon name="plus" size={14} /> Новая копилка
          </button>
        </div>
      </div>

      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">ДОЛГИ</div>
        <div className="space-y-3">
          {state.activeDebts.map(d => {
            const pct = d.total > 0 ? Math.round((d.paid / d.total) * 100) : 0;
            const left = d.total - d.paid;
            return (
              <div key={d.id} className="p-4 rounded-xl border border-stone-200 bg-gradient-to-br from-rose-50/40 to-amber-50/40">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{d.name}</div>
                    {d.note && <div className="text-xs text-stone-500 mt-0.5">{d.note}</div>}
                  </div>
                  <button onClick={() => setModal({ type: 'editDebt', data: d })} className="tap text-stone-500 p-1">
                    <Icon name="edit" size={16} />
                  </button>
                </div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-stone-500">Осталось:</span>
                  <span className="text-xl font-black numeric text-rose-800">{fmt(left)}</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: pct + '%', background: '#059669' }} />
                </div>
                <div className="flex justify-between mt-1 text-[11px] text-stone-500">
                  <span>Погашено {fmt(d.paid)}</span>
                  <span>Всего {fmt(d.total)}</span>
                </div>
                <button
                  onClick={() => setModal({ type: 'debtPay', data: d })}
                  className="tap w-full mt-2 text-xs py-1.5 px-3 rounded-lg bg-emerald-600 text-white font-medium"
                >
                  + Погасить часть
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============== SYNC TAB ==============
function SyncTab({ handleCSVImport, exportJSON, importJSON, state }) {
  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);

  return (
    <div className="space-y-4">
      <div className="paper rounded-3xl p-6 border border-stone-200 bg-gradient-to-br from-stone-900 to-stone-800 text-amber-50">
        <div className="text-xs tracking-widest mono opacity-60 mb-2">СИНХРОНИЗАЦИЯ</div>
        <h2 className="text-2xl font-black mb-3">Факт из Zenmoney</h2>
        <p className="text-sm opacity-80 leading-relaxed">
          Раз в неделю экспортируй CSV из Zenmoney и загружай сюда — факт по категориям обновится автоматически.
        </p>
      </div>

      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="upload" size={14} />
          <span className="text-xs tracking-widest mono text-stone-500">ИМПОРТ CSV ZENMONEY</span>
        </div>
        <button
          onClick={() => csvInputRef.current?.click()}
          className="tap w-full py-4 rounded-xl bg-stone-900 text-amber-50 font-bold flex items-center justify-center gap-2"
        >
          <Icon name="upload" size={18} /> Выбрать CSV файл
        </button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleCSVImport(e.target.files[0])}
        />
        <div className="mt-3 p-3 rounded-xl bg-stone-100 text-xs text-stone-600 space-y-1">
          <div><strong>Как получить CSV:</strong></div>
          <div>1. В приложении Zenmoney: меню → Экспорт</div>
          <div>2. На сайте zenmoney.ru: Настройки → Экспорт → CSV</div>
          <div>3. Импорт обновит факт для месяца: <strong>{state.month}</strong></div>
        </div>
      </div>

      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="copy" size={14} />
          <span className="text-xs tracking-widest mono text-stone-500">РЕЗЕРВНАЯ КОПИЯ</span>
        </div>
        <p className="text-sm text-stone-600 mb-3">
          Все данные хранятся только в этом устройстве. Чтобы перенести на другой телефон (жена на iPhone, комп на Windows) — экспортируй JSON и открой на другом устройстве.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={exportJSON}
            className="tap py-3 rounded-xl bg-emerald-700 text-white font-medium flex items-center justify-center gap-2"
          >
            <Icon name="download" size={16} /> Экспорт
          </button>
          <button
            onClick={() => jsonInputRef.current?.click()}
            className="tap py-3 rounded-xl bg-stone-200 text-stone-800 font-medium flex items-center justify-center gap-2"
          >
            <Icon name="upload" size={16} /> Импорт
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])}
          />
        </div>
      </div>

      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">МАППИНГ КАТЕГОРИЙ</div>
        <p className="text-sm text-stone-600 mb-3">
          Категории Zenmoney → группы в приложении (для импорта):
        </p>
        <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
          {Object.entries(state.categoryMapping).map(([zen, group]) => {
            const gName = state.groups.find(g => g.id === group)?.name || group;
            return (
              <div key={zen} className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-700">{zen}</span>
                <span className="text-stone-500 mono">→ {gName}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============== SETTINGS TAB ==============
function SettingsTab({ state, setState, resetAll, showToast, householdCode, onLeaveHousehold, syncStatus }) {
  const [startCash, setStartCash] = useState(state.startCash);
  const [income, setIncome] = useState(state.plannedIncome);
  const [month, setMonth] = useState(state.month);
  const [codeShown, setCodeShown] = useState(false);

  const save = () => {
    setState(s => ({ ...s, startCash: +startCash, plannedIncome: +income, month }));
    showToast('Сохранено');
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(householdCode);
      showToast('Код скопирован');
    } catch { showToast('Не получилось скопировать, выдели вручную', 'error'); }
  };

  const leave = () => {
    if (confirm('Отключиться от семейного бюджета?\n\nПосле этого можно ввести другой код. Данные в облаке останутся, жена/ты с других устройств продолжат видеть.')) {
      onLeaveHousehold();
    }
  };

  return (
    <div className="space-y-4">
      {/* Семейный код */}
      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs tracking-widest mono text-stone-500">СЕМЕЙНЫЙ КОД</div>
          <span className={`text-[10px] mono px-2 py-0.5 rounded-full ${
            syncStatus === 'synced' ? 'bg-emerald-100 text-emerald-800' :
            syncStatus === 'connecting' ? 'bg-amber-100 text-amber-800' :
            'bg-stone-100 text-stone-600'
          }`}>
            {syncStatus === 'synced' ? 'синхронизировано' :
             syncStatus === 'connecting' ? 'синхронизация…' :
             syncStatus === 'offline' ? 'офлайн' : 'ошибка связи'}
          </span>
        </div>
        <div className="p-4 rounded-xl bg-stone-900 text-amber-50 text-center">
          <div className="mono text-2xl tracking-[0.2em] font-bold numeric select-all">
            {codeShown ? householdCode : '••••-••••-••••'}
          </div>
          <div className="text-[11px] opacity-60 mt-1">
            {codeShown ? 'этот код даёт доступ к бюджету' : 'нажми, чтобы показать'}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => setCodeShown(s => !s)} className="tap py-2.5 rounded-xl bg-stone-200 text-stone-800 text-sm font-medium">
            {codeShown ? 'Скрыть' : 'Показать'}
          </button>
          <button onClick={copyCode} className="tap py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-medium">
            Скопировать
          </button>
        </div>
        <p className="text-xs text-stone-500 mt-3 leading-relaxed">
          Чтобы жена/муж увидели тот же бюджет — скинь этот код в мессенджере. На новом устройстве:
          открыть приложение → «У меня уже есть код» → ввести.
        </p>
        <button onClick={leave} className="tap w-full mt-3 py-2.5 rounded-xl bg-rose-50 text-rose-700 text-sm font-medium border border-rose-200">
          Отключиться от этого бюджета
        </button>
      </div>

      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">ОСНОВНЫЕ ПАРАМЕТРЫ</div>
        <div className="space-y-3">
          <label className="block">
            <div className="text-xs text-stone-500 mb-1">Месяц бюджета (YYYY-MM)</div>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="w-full p-3 rounded-xl border border-stone-300 bg-white"
            />
          </label>
          <label className="block">
            <div className="text-xs text-stone-500 mb-1">Деньги на старте месяца (₽)</div>
            <input
              type="number"
              value={startCash}
              onChange={e => setStartCash(e.target.value)}
              className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono"
            />
          </label>
          <label className="block">
            <div className="text-xs text-stone-500 mb-1">Планируемый доход (₽)</div>
            <input
              type="number"
              value={income}
              onChange={e => setIncome(e.target.value)}
              className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono"
            />
          </label>
          <button onClick={save} className="tap w-full py-3 rounded-xl bg-stone-900 text-amber-50 font-bold">
            Сохранить
          </button>
        </div>
      </div>

      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">ОПАСНАЯ ЗОНА</div>
        <button onClick={resetAll} className="tap w-full py-3 rounded-xl bg-rose-100 text-rose-800 font-medium border border-rose-200">
          Сбросить все данные
        </button>
        <p className="text-xs text-stone-500 mt-2">Вернёт состояние к начальному из плана мая.</p>
      </div>

      <div className="paper rounded-2xl p-5 border border-stone-200">
        <div className="text-xs tracking-widest mono text-stone-500 mb-3">О ПРИЛОЖЕНИИ</div>
        <div className="text-sm text-stone-700 space-y-1">
          <div>Семейный бюджет · v2.0</div>
          <div className="text-xs text-stone-500">Работает офлайн. Данные хранятся локально в браузере.</div>
          <div className="text-xs text-stone-500 mt-2">
            Чтобы добавить на главный экран: меню браузера → «Установить приложение» или «На главный экран».
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== MODAL ==============
function Modal({ modal, setModal, state, setState, updateItem, addItem, deleteItem, showToast }) {
  const close = () => setModal(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 fadein p-0 md:p-4 md:items-center" onClick={close}>
      <div
        className="bg-amber-50 rounded-t-3xl md:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto safe-bottom slideup"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-amber-50 border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <div className="font-bold">
            {modal.type === 'editItem' && 'Редактировать'}
            {modal.type === 'addItem' && 'Новая позиция'}
            {modal.type === 'editPot' && 'Копилка'}
            {modal.type === 'addPot' && 'Новая копилка'}
            {modal.type === 'potAdd' && 'Пополнить копилку'}
            {modal.type === 'potWithdraw' && 'Взять из копилки'}
            {modal.type === 'editDebt' && 'Долг'}
            {modal.type === 'debtPay' && 'Погасить долг'}
          </div>
          <button onClick={close} className="tap p-1"><Icon name="close" size={22} /></button>
        </div>
        <div className="p-5">
          {modal.type === 'editItem' && (
            <EditItemForm data={modal.data} updateItem={updateItem} deleteItem={deleteItem} close={close} />
          )}
          {modal.type === 'addItem' && (
            <AddItemForm groupId={modal.data.groupId} addItem={addItem} close={close} />
          )}
          {modal.type === 'editPot' && (
            <EditPotForm data={modal.data} setState={setState} close={close} />
          )}
          {modal.type === 'addPot' && (
            <AddPotForm setState={setState} close={close} />
          )}
          {modal.type === 'potAdd' && (
            <PotAmountForm data={modal.data} setState={setState} close={close} isAdd={true} />
          )}
          {modal.type === 'potWithdraw' && (
            <PotAmountForm data={modal.data} setState={setState} close={close} isAdd={false} />
          )}
          {modal.type === 'editDebt' && (
            <EditDebtForm data={modal.data} setState={setState} close={close} />
          )}
          {modal.type === 'debtPay' && (
            <DebtPayForm data={modal.data} setState={setState} close={close} />
          )}
        </div>
      </div>
    </div>
  );
}

function EditItemForm({ data, updateItem, deleteItem, close }) {
  const { groupId, item } = data;
  const [name, setName] = useState(item.name);
  const [planned, setPlanned] = useState(item.planned);
  const [actual, setActual] = useState(item.actual || 0);

  const save = () => {
    updateItem(groupId, item.id, { name, planned: +planned, actual: +actual });
    close();
  };
  const del = () => {
    if (confirm('Удалить позицию?')) {
      deleteItem(groupId, item.id);
      close();
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Название</div>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">План (₽)</div>
        <input type="number" value={planned} onChange={e => setPlanned(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Потрачено (₽)</div>
        <input type="number" value={actual} onChange={e => setActual(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <div className="flex gap-2 pt-2">
        <button onClick={del} className="tap flex-1 py-3 rounded-xl bg-rose-100 text-rose-800 font-medium">
          Удалить
        </button>
        <button onClick={save} className="tap flex-1 py-3 rounded-xl bg-stone-900 text-amber-50 font-bold">
          Сохранить
        </button>
      </div>
    </div>
  );
}

function AddItemForm({ groupId, addItem, close }) {
  const [name, setName] = useState('');
  const [planned, setPlanned] = useState('');
  return (
    <div className="space-y-3">
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Название</div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">План (₽)</div>
        <input type="number" value={planned} onChange={e => setPlanned(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <button
        onClick={() => { if (name && planned) { addItem(groupId, { name, planned: +planned }); close(); } }}
        className="tap w-full py-3 rounded-xl bg-stone-900 text-amber-50 font-bold"
      >
        Добавить
      </button>
    </div>
  );
}

function EditPotForm({ data, setState, close }) {
  const [name, setName] = useState(data.name);
  const [target, setTarget] = useState(data.target);
  const [current, setCurrent] = useState(data.current);
  const [note, setNote] = useState(data.note || '');

  const save = () => {
    setState(s => ({
      ...s,
      savedPots: s.savedPots.map(p => p.id === data.id ? { ...p, name, target: +target, current: +current, note } : p),
    }));
    close();
  };
  const del = () => {
    if (confirm('Удалить копилку?')) {
      setState(s => ({ ...s, savedPots: s.savedPots.filter(p => p.id !== data.id) }));
      close();
    }
  };
  return (
    <div className="space-y-3">
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Название</div>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Цель (₽)</div>
        <input type="number" value={target} onChange={e => setTarget(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Текущий остаток (₽)</div>
        <input type="number" value={current} onChange={e => setCurrent(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Примечание</div>
        <input value={note} onChange={e => setNote(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <div className="flex gap-2">
        <button onClick={del} className="tap flex-1 py-3 rounded-xl bg-rose-100 text-rose-800 font-medium">Удалить</button>
        <button onClick={save} className="tap flex-1 py-3 rounded-xl bg-stone-900 text-amber-50 font-bold">Сохранить</button>
      </div>
    </div>
  );
}

function AddPotForm({ setState, close }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const save = () => {
    if (!name) return;
    setState(s => ({
      ...s,
      savedPots: [...s.savedPots, { id: uid(), name, target: +target || 0, current: 0, note }],
    }));
    close();
  };
  return (
    <div className="space-y-3">
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Название</div>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Цель (₽)</div>
        <input type="number" value={target} onChange={e => setTarget(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Примечание</div>
        <input value={note} onChange={e => setNote(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <button onClick={save} className="tap w-full py-3 rounded-xl bg-stone-900 text-amber-50 font-bold">Создать</button>
    </div>
  );
}

function PotAmountForm({ data, setState, close, isAdd }) {
  const [amount, setAmount] = useState('');
  const save = () => {
    const n = +amount;
    if (!n) return;
    setState(s => ({
      ...s,
      savedPots: s.savedPots.map(p => p.id === data.id ? { ...p, current: Math.max(0, p.current + (isAdd ? n : -n)) } : p),
    }));
    close();
  };
  return (
    <div className="space-y-3">
      <div className="text-sm text-stone-600">{data.name} · сейчас {fmt(data.current)}</div>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Сумма (₽)</div>
        <input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono text-xl" />
      </label>
      <button onClick={save} className={`tap w-full py-3 rounded-xl font-bold ${isAdd ? 'bg-emerald-700 text-white' : 'bg-amber-700 text-white'}`}>
        {isAdd ? 'Пополнить' : 'Взять'}
      </button>
    </div>
  );
}

function EditDebtForm({ data, setState, close }) {
  const [name, setName] = useState(data.name);
  const [total, setTotal] = useState(data.total);
  const [paid, setPaid] = useState(data.paid);
  const [note, setNote] = useState(data.note || '');
  const save = () => {
    setState(s => ({
      ...s,
      activeDebts: s.activeDebts.map(d => d.id === data.id ? { ...d, name, total: +total, paid: +paid, note } : d),
    }));
    close();
  };
  const del = () => {
    if (confirm('Удалить долг?')) {
      setState(s => ({ ...s, activeDebts: s.activeDebts.filter(d => d.id !== data.id) }));
      close();
    }
  };
  return (
    <div className="space-y-3">
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Название</div>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Всего долга (₽)</div>
        <input type="number" value={total} onChange={e => setTotal(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Погашено (₽)</div>
        <input type="number" value={paid} onChange={e => setPaid(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono" />
      </label>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Примечание</div>
        <input value={note} onChange={e => setNote(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white" />
      </label>
      <div className="flex gap-2">
        <button onClick={del} className="tap flex-1 py-3 rounded-xl bg-rose-100 text-rose-800 font-medium">Удалить</button>
        <button onClick={save} className="tap flex-1 py-3 rounded-xl bg-stone-900 text-amber-50 font-bold">Сохранить</button>
      </div>
    </div>
  );
}

function DebtPayForm({ data, setState, close }) {
  const [amount, setAmount] = useState('');
  const save = () => {
    const n = +amount;
    if (!n) return;
    setState(s => ({
      ...s,
      activeDebts: s.activeDebts.map(d => d.id === data.id ? { ...d, paid: Math.min(d.total, d.paid + n) } : d),
    }));
    close();
  };
  return (
    <div className="space-y-3">
      <div className="text-sm text-stone-600">{data.name} · осталось {fmt(data.total - data.paid)}</div>
      <label className="block">
        <div className="text-xs text-stone-500 mb-1">Погасить (₽)</div>
        <input autoFocus type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 rounded-xl border border-stone-300 bg-white numeric mono text-xl" />
      </label>
      <button onClick={save} className="tap w-full py-3 rounded-xl bg-emerald-700 text-white font-bold">
        Погасить
      </button>
    </div>
  );
}

// ============== ХЕЛПЕРЫ UI ==============
function TabBtn({ id, label, icon, active, setActive }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => setActive(id)}
      className={`tap flex flex-col items-center gap-1 py-2 rounded-xl transition ${
        isActive ? 'bg-stone-900 text-amber-50' : 'text-stone-600'
      }`}
    >
      <Icon name={icon} size={18} />
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </button>
  );
}

function MathRow({ label, val, neg, pos, bold }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-sm ${bold ? 'font-bold' : ''} text-stone-700`}>{label}</span>
      <span className={`numeric mono ${bold ? 'text-xl font-black' : 'text-sm'} ${neg ? 'text-rose-800' : pos ? 'text-emerald-800' : 'text-stone-900'}`}>
        {val}
      </span>
    </div>
  );
}

// ============== ONBOARDING ==============
function Onboarding({ onReady }) {
  const [screen, setScreen] = useState('welcome'); // welcome | create | join
  const [createdCode, setCreatedCode] = useState(null);
  const [inputCode, setInputCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const doCreate = () => {
    const code = genHouseholdCode();
    setCreatedCode(code);
    saveHousehold(code);
    setScreen('created');
  };
  const finishCreate = () => onReady(createdCode);

  const doJoin = async () => {
    setError('');
    if (!isValidCode(inputCode)) {
      setError('Код должен быть 12 символов (как ABCD-EFGH-JKLM)');
      return;
    }
    setBusy(true);
    const code = formatCode(inputCode);
    try {
      const snap = await db.collection('households').doc(code).get();
      if (!snap.exists) {
        setError('Такого бюджета нет. Проверь код или создай новый.');
        setBusy(false);
        return;
      }
      saveHousehold(code);
      onReady(code);
    } catch (e) {
      setError('Ошибка: ' + (e.message || e.code || 'нет связи'));
      setBusy(false);
    }
  };

  const copyCreated = async () => {
    try { await navigator.clipboard.writeText(createdCode); } catch {}
  };

  return (
    <div className="min-h-screen paper flex items-center justify-center p-5">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-block w-16 h-16 rounded-2xl bg-stone-900 text-amber-50 flex items-center justify-center text-4xl font-black">V</div>
          <div className="text-[10px] tracking-[0.3em] text-stone-500 mono mt-4">СЕМЕЙНЫЙ БЮДЖЕТ</div>
          <h1 className="text-3xl font-black mt-1">Добро пожаловать</h1>
        </div>

        {screen === 'welcome' && (
          <div className="space-y-3 slideup">
            <button
              onClick={doCreate}
              className="tap w-full p-5 rounded-2xl bg-stone-900 text-amber-50 text-left"
            >
              <div className="text-xs tracking-widest mono opacity-60 mb-1">СОЗДАТЬ НОВЫЙ</div>
              <div className="text-lg font-bold">У меня ещё нет бюджета</div>
              <div className="text-xs opacity-70 mt-1">Создам, потом смогу поделиться кодом с женой / мужем</div>
            </button>
            <button
              onClick={() => setScreen('join')}
              className="tap w-full p-5 rounded-2xl border-2 border-stone-300 text-left"
            >
              <div className="text-xs tracking-widest mono text-stone-500 mb-1">ПРИСОЕДИНИТЬСЯ</div>
              <div className="text-lg font-bold text-stone-900">У меня уже есть код</div>
              <div className="text-xs text-stone-500 mt-1">Введу код от супруга / супруги</div>
            </button>
          </div>
        )}

        {screen === 'created' && (
          <div className="space-y-3 slideup">
            <div className="p-5 rounded-2xl paper border border-stone-200">
              <div className="text-xs tracking-widest mono text-stone-500 mb-2">КОД ТВОЕГО БЮДЖЕТА</div>
              <div className="p-4 rounded-xl bg-stone-900 text-amber-50 text-center mono text-2xl tracking-[0.2em] font-bold select-all">
                {createdCode}
              </div>
              <button onClick={copyCreated} className="tap w-full mt-3 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-medium">
                Скопировать
              </button>
              <p className="text-xs text-stone-500 mt-3 leading-relaxed">
                Сохрани этот код. Чтобы второй член семьи увидел тот же бюджет — скинь ему код в мессенджере,
                он введёт его при первом запуске приложения. Код всегда доступен в настройках.
              </p>
            </div>
            <button onClick={finishCreate} className="tap w-full py-4 rounded-2xl bg-stone-900 text-amber-50 font-bold">
              Продолжить →
            </button>
          </div>
        )}

        {screen === 'join' && (
          <div className="space-y-3 slideup">
            <div className="p-5 rounded-2xl paper border border-stone-200">
              <label className="block">
                <div className="text-xs tracking-widest mono text-stone-500 mb-2">КОД БЮДЖЕТА</div>
                <input
                  autoFocus
                  value={inputCode}
                  onChange={e => { setInputCode(formatCode(e.target.value)); setError(''); }}
                  placeholder="ABCD-EFGH-JKLM"
                  className="w-full p-4 rounded-xl border-2 border-stone-300 bg-white mono text-xl text-center tracking-[0.15em] font-bold uppercase"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              {error && <div className="text-sm text-rose-700 mt-2">{error}</div>}
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => { setScreen('welcome'); setError(''); }} className="tap py-3 rounded-xl bg-stone-200 text-stone-800 font-medium">
                  Назад
                </button>
                <button
                  onClick={doJoin}
                  disabled={busy || !isValidCode(inputCode)}
                  className="tap py-3 rounded-xl bg-stone-900 text-amber-50 font-bold disabled:opacity-40"
                >
                  {busy ? 'Проверка…' : 'Войти'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="text-center text-[11px] text-stone-400 mono mt-6">
          Real-time синхронизация между устройствами
        </div>
      </div>
    </div>
  );
}

// ============== ROOT ==============
function Root() {
  const [householdCode, setHouseholdCode] = useState(loadHousehold());

  const leave = () => {
    clearHousehold();
    setHouseholdCode(null);
  };

  if (!householdCode) {
    return <Onboarding onReady={(code) => setHouseholdCode(code)} />;
  }
  return <App householdCode={householdCode} onLeaveHousehold={leave} />;
}

// ============== MOUNT ==============
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Root />);
