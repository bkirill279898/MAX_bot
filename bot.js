//
//
//import 'dotenv/config';
//import { Bot, Keyboard } from '@maxhub/max-bot-api';
//import fs from 'fs/promises';
//
//const bot = new Bot(process.env.BOT_TOKEN);
//
//// Храним ID последних сообщений бота для каждого пользователя
//const lastBotMessages = new Map();
//
//// Путь к файлу со статусами уборки
//const CLEANING_STATUS_FILE = './cleaning_status.json';
//
//// ---------- Кэширование данных ----------
//const CACHE_TTL = 10 * 60 * 1000; // 10 минут
//
//const cache = {
//  bookings: new Map(),      // Кэш бронирований {date: {data, expiresAt}}
//  residents: new Map(),     // Кэш проживающих {date: {data, expiresAt}}
//  weekStats: null,          // Кэш статистики на неделю {data, expiresAt}
//};
//
//// Проверка валидности кэша
//function isCacheValid(cacheEntry) {
//  return cacheEntry && Date.now() < cacheEntry.expiresAt;
//}
//
//// Получить данные из кэша
//function getCached(cacheMap, key) {
//  let entry;
//
//  if (key === null) {
//    // Для weekStats (объект, не Map)
//    entry = cacheMap;
//  } else {
//    // Для Map (bookings, residents)
//    entry = cacheMap.get(key);
//  }
//
//  if (isCacheValid(entry)) {
//    console.log(`⚡️ Из кэша: ${key || 'weekStats'}`);
//    return entry.data;
//  }
//  return null;
//}
//
//// Сохранить данные в кэш
//function setCached(cacheMap, key, data) {
//  const entry = {
//    data: data,
//    expiresAt: Date.now() + CACHE_TTL
//  };
//
//  if (key === null) {
//    // Для weekStats - это обрабатывается отдельно в getWeekStats
//    return;
//  } else {
//    // Для Map (bookings, residents)
//    cacheMap.set(key, entry);
//  }
//
//  console.log(`💾 Сохранено в кэш: ${key || 'weekStats'}`);
//}
//
//// Очистить весь кэш
//function clearAllCache() {
//  cache.bookings.clear();
//  cache.residents.clear();
//  cache.weekStats = null;
//  console.log('🔄 Кэш полностью очищен');
//}
//
//// Предзагрузка кэша (загружаем все данные заранее)
//async function preloadCache() {
//  console.log('🔄 Начинаем предзагрузку кэша...');
//
//  const today = formatDateISO(new Date());
//  const tomorrow = new Date();
//  tomorrow.setDate(tomorrow.getDate() + 1);
//  const tomorrowStr = formatDateISO(tomorrow);
//
//  // Запускаем все запросы параллельно
//  try {
//    await Promise.all([
//      getBookings(today, true),        // Сегодня
//      getBookings(tomorrowStr, false), // Завтра
//      getResidents(today),             // Проживающие
//      getWeekStats()                   // Статистика
//    ]);
//    console.log('✅ Предзагрузка кэша завершена');
//  } catch (error) {
//    console.error('❌ Ошибка предзагрузки кэша:', error.message);
//  }
//}
//
//// ---------- Работа со статусами уборки ----------
//// Чтение статусов из файла
//async function readCleaningStatus() {
//  try {
//    const data = await fs.readFile(CLEANING_STATUS_FILE, 'utf-8');
//    return JSON.parse(data);
//  } catch (error) {
//    // Файл не существует или ошибка - возвращаем пустой объект
//    return {};
//  }
//}
//
//// Запись статусов в файл
//async function saveCleaningStatus(statuses) {
//  await fs.writeFile(CLEANING_STATUS_FILE, JSON.stringify(statuses, null, 2), 'utf-8');
//}
//
//// Получить статус конкретного номера на дату
//async function getRoomStatus(date, roomName) {
//  const statuses = await readCleaningStatus();
//  return statuses[date]?.[roomName] || 'not_started';
//}
//
//// Установить статус номера
//async function setRoomStatus(date, roomName, status) {
//  const statuses = await readCleaningStatus();
//
//  if (!statuses[date]) {
//    statuses[date] = {};
//  }
//
//  statuses[date][roomName] = status;
//  await saveCleaningStatus(statuses);
//}
//
//// Сбросить все статусы
//async function resetAllStatuses() {
//  await saveCleaningStatus({});
//}
//
//// Получить эмодзи для статуса
//function getStatusEmoji(status) {
//  switch (status) {
//    case 'not_started': return '⚪️';
//    case 'in_progress': return '⏳';
//    case 'done': return '✅';
//    default: return '⚪️';
//  }
//}
//
//// Получить текст для статуса
//function getStatusText(status) {
//  switch (status) {
//    case 'not_started': return 'Не начато';
//    case 'in_progress': return 'В процессе';
//    case 'done': return 'Убрано';
//    default: return 'Не начато';
//  }
//}
//
//// ---------- Настройки PMS ----------
//const PMS_ID = process.env.PMS_ID;
//const PMS_PASSWORD = process.env.PMS_PASSWORD;
//// ---------- Конфигурация комиссий ----------
//const CHANNEL_CONFIG = {
//  "Яндекс Путешествия (новая версия)": {
//    commission_rate: 0.25,
//    days_offset: 14,
//    special_date_rule: null,
//    note: "цена неточная, примерная, так как ЯП работают некорректно. комиссия от 15% до 25%"
//  },
//  "Roomlink (ранее — Забронируй.ру)": {
//    commission_rate: 0.23,
//    days_offset: 0,
//    special_date_rule: "17th_after_checkout",
//    note: "✓ уточняется способ оплаты, автоплатеж с 5-15 число"
//  },
//  "ТВИЛ": {
//    commission_rate: 0.20,
//    days_offset: 0,
//    special_date_rule: "checkin_date",
//    note: "✓ комиссия аванс на сайте, остальное наличными"
//  },
//  "Прямое": {
//    commission_rate: 0.15,
//    days_offset: 0,
//    special_date_rule: "checkin_date",
//    note: "✓ аванс+оплата"
//  },
//  "Модуль бронирования": {
//    commission_rate: 0.15,
//    days_offset: 0,
//    special_date_rule: "checkin_date",
//    note: "✓ аванс+оплата"
//  },
//  "Otello": {
//    commission_rate: 0.15,
//    days_offset: 5,
//    special_date_rule: null,
//    note: "✓ автоплатеж через 2-5 дней после брони"
//  },
//  "101hotels.com": {
//    commission_rate: 0.15,
//    days_offset: 0,
//    special_date_rule: "17th_after_checkout",
//    note: "присылают после взаимозачета с 1-15 число"
//  },
//  "Островок!": {
//    commission_rate: 0.15,
//    days_offset: 0,
//    special_date_rule: "25th_after_checkout",
//    note: "✓ автоплатеж 25 числа"
//  },
//  "Mirturbaz": {
//    commission_rate: 0.15,
//    days_offset: 0,
//    special_date_rule: "25th_after_checkout",
//    note: "✓ автоплатеж уточняется дата оплаты"
//  },
//  "OneTwoTrip!": {
//    commission_rate: 0.20,
//    days_offset: 0,
//    special_date_rule: "15th_after_checkout",
//    note: "✓ автоплатеж с 5-15 число"
//  },
//  "Суточно.ру": {
//    commission_rate: 0.20,
//    days_offset: 0,
//    special_date_rule: "checkin_date",
//    note: "✓ аванс на сайте+наличными"
//  },
//  "Avito": {
//    commission_rate: 0.20,
//    days_offset: 0,
//    special_date_rule: "checkin_date",
//    note: "✓ комиссия аванс на сайте, остальное наличными"
//  }
//};
//
//// Расчет комиссии
//function calculateCommission(channel, amount) {
//  const config = CHANNEL_CONFIG[channel];
//  if (!config) return 0;
//  return amount * config.commission_rate;
//}
//
//// Расчет суммы к получению
//function calculateAmountToReceive(channel, amount) {
//  const commission = calculateCommission(channel, amount);
//  return amount - commission;
//}
//
//// Расчет даты поступления оплаты
//function calculatePaymentDate(channel, checkinDate, checkoutDate) {
//  const config = CHANNEL_CONFIG[channel];
//  if (!config) return new Date(checkinDate);
//
//  const rule = config.special_date_rule;
//  const checkoutDateObj = new Date(checkoutDate);
//
//    if (rule === "17th_after_checkout") {
//      const payout = new Date(checkoutDateObj);
//      payout.setDate(1); // важно, чтобы не было багов с концом месяца
//      payout.setMonth(payout.getMonth() + 1);
//      payout.setDate(17);
//      return payout;
//    }
//
//      if (rule === "25th_after_checkout") {
//      const payout = new Date(checkoutDateObj);
//      payout.setDate(1); // защита от переполнения месяца
//      payout.setMonth(payout.getMonth() + 1);
//      payout.setDate(25);
//      return payout;
//    }
//
//    if (rule === "15th_after_checkout") {
//      const payout = new Date(checkoutDateObj);
//      payout.setDate(1); // защита от переполнения месяца
//      payout.setMonth(payout.getMonth() + 1);
//      payout.setDate(15);
//      return payout;
//    }
//
//  if (rule === "checkin_date") {
//    return new Date(checkinDate);
//  }
//
//  // Иначе используем days_offset от даты выезда
//  const paymentDate = new Date(checkoutDateObj);
//  paymentDate.setDate(paymentDate.getDate() + (config.days_offset || 0));
//  return paymentDate;
//}
//
//// ---------- Вспомогательные функции ----------
//// Склонение слова "человек"
//function pluralize(count) {
//  const cases = [2, 0, 1, 1, 1, 2];
//  const titles = ['человек', 'человека', 'человек'];
//  return titles[
//    count % 100 > 4 && count % 100 < 20
//      ? 2
//      : cases[Math.min(count % 10, 5)]
//  ];
//}
//
//// Форматирование даты в ДД.ММ
//function formatDateDDMM(date) {
//  const d = String(date.getDate()).padStart(2, "0");
//  const m = String(date.getMonth() + 1).padStart(2, "0");
//  return `${d}.${m}`;
//}
//
//// Форматирование даты в YYYY-MM-DD
//function formatDateISO(date) {
//  const y = date.getFullYear();
//  const m = String(date.getMonth() + 1).padStart(2, "0");
//  const d = String(date.getDate()).padStart(2, "0");
//  return `${y}-${m}-${d}`;
//}
//
//// Сокращение названия номера для кнопок
//function shortenRoomName(roomName) {
//  if (!roomName) return roomName;
//
//  const name = roomName.toString();
//
//  // Коттедж №1 → К1
//  if (name.includes("Коттедж")) {
//    const match = name.match(/(\d+)/);
//    if (match) {
//      return `К${match[1]}`;
//    }
//  }
//
//  // Мотель №1 → М1
//  if (name.includes("Мотель")) {
//    const match = name.match(/(\d+)/);
//    if (match) {
//      return `М${match[1]}`;
//    }
//  }
//
//  // Для других названий - возвращаем как есть
//  return name;
//}
//
//// Сортировка по названию номера
//function sortByRoomName(bookings) {
//  return bookings.sort((a, b) => {
//    const nameA = (a.room_name || "").toString();
//    const nameB = (b.room_name || "").toString();
//    return nameA.localeCompare(nameB, 'ru', { numeric: true, sensitivity: 'base' });
//  });
//}
//
//// Функция отправки сообщения с удалением предыдущего
//async function replyAndDeletePrevious(ctx, text, options = {}) {
//  const userId = ctx.user?.user_id || ctx.message?.sender?.user_id;
//
//  if (!userId) {
//    // Если не можем определить пользователя, просто отправляем
//    return await ctx.reply(text, options);
//  }
//
//  // Удаляем предыдущее сообщение, если оно есть
//  const previousMessageId = lastBotMessages.get(userId);
//  if (previousMessageId) {
//    try {
//      // Используем правильный формат с query-параметрами
//      const response = await fetch(
//        `https://platform-api.max.ru/messages?message_id=${previousMessageId}`,
//        {
//          method: 'DELETE',
//          headers: {
//            'Authorization': process.env.BOT_TOKEN
//          }
//        }
//      );
//
//      if (!response.ok) {
//        console.log('Не удалось удалить сообщение, статус:', response.status);
//      }
//    } catch (error) {
//      // Игнорируем ошибки удаления (сообщение могло быть уже удалено или старше 24 часов)
//      console.log('Ошибка при удалении сообщения:', error.message);
//    }
//  }
//
//  // Отправляем новое сообщение
//  const newMessage = await ctx.reply(text, options);
//
//  // Сохраняем ID нового сообщения
//  if (newMessage?.body?.mid) {
//    lastBotMessages.set(userId, newMessage.body.mid);
//  }
//
//  return newMessage;
//}
//
//// ---------- Авторизация ----------
//async function getBearer() {
//  try {
//    const resp = await fetch("https://api.pms.bnovo.ru/api/v1/auth", {
//      method: "POST",
//      headers: { "Content-Type": "application/json" },
//      body: JSON.stringify({
//        id: PMS_ID,
//        password: PMS_PASSWORD
//      })
//    });
//
//    const data = await resp.json();
//
//    if (!data.data) {
//      throw new Error("Ошибка авторизации: " + (data.message || "неизвестная ошибка"));
//    }
//
//    return data.data.access_token;
//  } catch (error) {
//    console.error("❌ Ошибка при получении токена:", error.message);
//    throw error;
//  }
//}
//
//// ---------- Получение бронирований ----------
//async function getBookings(targetDate, showStatuses = true) {
//  // Проверяем кэш
//  const cacheKey = `bookings_${targetDate}`;
//  const cached = getCached(cache.bookings, cacheKey);
//
//  if (cached) {
//    // Есть в кэше - генерируем отображение со свежими статусами
//    return await generateBookingsDisplay(cached.departures, cached.arrivals, targetDate, showStatuses);
//  }
//
//  // Кэша нет - запрашиваем API
//  console.log(`🌐 Запрос к API: бронирования на ${targetDate}`);
//  const bearer = await getBearer();
//
//  // Диапазон: день назад → целевая дата
//  // Это захватит все брони пересекающиеся с целевой датой
//  const targetDateObj = new Date(targetDate);
//  const dayBeforeObj = new Date(targetDateObj);
//  dayBeforeObj.setDate(targetDateObj.getDate() - 1);
//
//  const date_from = formatDateISO(dayBeforeObj);
//  const date_to = targetDate;
//
//  // Используем checkmate - вернёт все брони пересекающиеся с диапазоном
//  let allBookings = [];
//  let offset = 0;
//  const limit = 50;
//
//  while (true) {
//    const resp = await fetch(
//      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkmate&limit=${limit}&offset=${offset}`,
//      {
//        headers: {
//          Authorization: `Bearer ${bearer}`
//        }
//      }
//    );
//
//    const data = await resp.json();
//    const bookingsPage = data.data?.bookings || [];
//    allBookings = allBookings.concat(bookingsPage);
//
//    if (bookingsPage.length < limit) {
//      break;
//    }
//
//    offset += limit;
//  }
//
//  // Вручную фильтруем выезды и заезды
//  const departures = allBookings.filter(
//    (b) =>
//      b.status?.name !== "Отменен" &&
//      b.dates?.departure?.substring(0, 10) === targetDate
//  );
//
//  const arrivals = allBookings.filter(
//    (b) =>
//      b.status?.name !== "Отменен" &&
//      b.dates?.arrival?.substring(0, 10) === targetDate
//  );
//
//  // Сортируем по номерам
//  sortByRoomName(departures);
//  sortByRoomName(arrivals);
//
//  // Сохраняем в кэш
//  setCached(cache.bookings, cacheKey, { departures, arrivals });
//
//  // Генерируем отображение
//  return await generateBookingsDisplay(departures, arrivals, targetDate, showStatuses);
//}
//
//// Генерация отображения бронирований (для кэша)
//async function generateBookingsDisplay(departures, arrivals, targetDate, showStatuses) {
//  // Форматируем дату для заголовка
//  const displayDate = formatDateDDMM(new Date(targetDate));
//
//  let text = `📅 Движение на ${displayDate}\n`;
//  text += `Всего выездов: ${departures.length} | Всего заездов: ${arrivals.length}\n\n`;
//
//  // Клавиатура с кнопками статусов
//  const statusButtons = [];
//
//  // Блок 1 — выезды
//  text += "🔴 Выезды:\n";
//  if (departures.length === 0) {
//    text += "Выездов нет ✅\n\n";
//  } else {
//    for (const b of departures) {
//      const adults = b.extra?.adults || 0;
//      const guestName = `${b.customer?.name || ""} ${b.customer?.surname || ""}`.trim();
//
//      if (showStatuses) {
//        // Показываем статус и добавляем кнопки
//        const status = await getRoomStatus(targetDate, b.room_name);
//        const statusEmoji = getStatusEmoji(status);
//
//        text += `${statusEmoji} ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})\n`;
//
//        // Сокращаем название для кнопок
//        const shortName = shortenRoomName(b.room_name);
//
//        // Добавляем ряд кнопок для этого номера
//        statusButtons.push([
//          Keyboard.button.callback(
//            `${shortName}⚪️`,
//            `status:${targetDate}:${b.room_name}:not_started`
//          ),
//          Keyboard.button.callback(
//            `${shortName}⏳`,
//            `status:${targetDate}:${b.room_name}:in_progress`
//          ),
//          Keyboard.button.callback(
//            `${shortName}✅`,
//            `status:${targetDate}:${b.room_name}:done`
//          )
//        ]);
//      } else {
//        // Без статусов - просто список
//        text += `• ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})\n`;
//      }
//
//      text += "\n";
//    }
//  }
//
//  // Блок 2 — заезды
//  text += "🟢 Заезды:\n";
//  if (arrivals.length === 0) {
//    text += "Заездов нет ✅\n\n";
//  } else {
//    for (const b of arrivals) {
//      const adults = b.extra?.adults || 0;
//      const guestName = `${b.customer?.name || ""} ${b.customer?.surname || ""}`.trim();
//      text += `• ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})\n\n`;
//    }
//  }
//
//  return { text, statusButtons, targetDate };
//}
//
//// ---------- Получение проживающих ----------
//async function getResidents(targetDateStr) {
//  // Проверяем кэш
//  const cacheKey = `residents_${targetDateStr}`;
//  const cached = getCached(cache.residents, cacheKey);
//
//  if (cached) {
//    // Есть в кэше - возвращаем
//    return cached;
//  }
//
//  // Кэша нет - запрашиваем API
//  console.log(`🌐 Запрос к API: проживающие на ${targetDateStr}`);
//  const bearer = await getBearer();
//
//  const targetDateObj = new Date(targetDateStr);
//
//  // Диапазон: день назад → целевая дата
//  const dayBeforeObj = new Date(targetDateObj);
//  dayBeforeObj.setDate(targetDateObj.getDate() - 1);
//
//  const date_from = formatDateISO(dayBeforeObj);
//  const date_to = targetDateStr;
//
//  // Получаем все бронирования с пагинацией
//  let offset = 0;
//  const limit = 50;
//  let allBookings = [];
//
//  while (true) {
//    const resp = await fetch(
//      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkmate&limit=${limit}&offset=${offset}`,
//      {
//        headers: { Authorization: `Bearer ${bearer}` }
//      }
//    );
//
//    const data = await resp.json();
//    const bookingsPage = data.data?.bookings || [];
//    allBookings = allBookings.concat(bookingsPage);
//
//    if (bookingsPage.length < limit) {
//      break;
//    }
//
//    offset += limit;
//  }
//
//  const displayDate = formatDateDDMM(new Date(targetDateStr));
//  let text = `🏡 Проживающие ${displayDate}\n\n`;
//
//  const dateOnly = (isoLike) => (isoLike ? String(isoLike).substring(0, 10) : "");
//
//  // Условие: arrival_date <= today < departure_date
//  // Также включаем тех, кто заехал сегодня (arrival = today)
//  // НЕ включаем тех, кто ТОЛЬКО выезжает сегодня (arrival < today && departure = today)
//  const residents = allBookings.filter(b => {
//    if (b.status?.name === "Отменен") return false;
//
//    const arrivalDate = dateOnly(b.dates?.arrival);
//    const departureDate = dateOnly(b.dates?.departure);
//
//    if (!arrivalDate || !departureDate) return false;
//
//    // Гость проживает, если arrival <= today < departure
//    const isResiding = arrivalDate <= targetDateStr && targetDateStr < departureDate;
//
//    return isResiding;
//  });
//
//  if (residents.length === 0) {
//    text += "Никто не проживает ✅";
//  } else {
//    // Сортируем по названию номера
//    sortByRoomName(residents);
//
//    text += "Проживающие:\n";
//    for (const b of residents) {
//      const arrivalDate = dateOnly(b.dates?.arrival);
//      const adults = b.extra?.adults || 0;
//      const guestName = `${b.customer?.name || ""} ${b.customer?.surname || ""}`.trim();
//
//      // Отметка "заезд сегодня"
//      const arrivalTag = arrivalDate === targetDateStr ? " (заезд сегодня)" : "";
//
//      text += `• ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})${arrivalTag}\n\n`;
//    }
//  }
//
//  // Сохраняем в кэш
//  setCached(cache.residents, cacheKey, text);
//
//  return text;
//}
//
//// ---------- Получение статистики на неделю ----------
//async function getWeekStats() {
//  // Проверяем кэш
//  const cached = getCached(cache.weekStats, null);
//
//  if (cached) {
//    // Есть в кэше - возвращаем
//    return cached;
//  }
//
//  // Кэша нет - запрашиваем API
//  console.log('🌐 Запрос к API: статистика на неделю');
//  const bearer = await getBearer();
//
//  const today = new Date();
//
//  // Диапазон: сегодня + 7 дней вперёд
//  // data_type=checkmate вернёт все брони пересекающиеся с этим диапазоном
//  const fromDateObj = new Date(today);
//  const toDateObj = new Date(today);
//  toDateObj.setDate(today.getDate() + 6); // +6 дней = 7 дней всего
//
//  const date_from = formatDateISO(fromDateObj);
//  const date_to = formatDateISO(toDateObj);
//
//  // Получаем все бронирования с пагинацией
//  let offset = 0;
//  const limit = 50;
//  let allBookings = [];
//
//  while (true) {
//    const resp = await fetch(
//      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkmate&limit=${limit}&offset=${offset}`,
//      {
//        headers: { Authorization: `Bearer ${bearer}` }
//      }
//    );
//
//    const data = await resp.json();
//    const bookingsPage = data.data?.bookings || [];
//    allBookings = allBookings.concat(bookingsPage);
//
//    if (bookingsPage.length < limit) {
//      break;
//    }
//
//    offset += limit;
//  }
//
//  const dateOnly = (isoLike) => (isoLike ? String(isoLike).substring(0, 10) : "");
//
//  let text = "📊 Статистика на неделю\n\n";
//
//  const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
//  let totalDepartures = 0;
//  let totalArrivals = 0;
//
//  // Проходим по 7 дням начиная с сегодня
//  for (let i = 0; i < 7; i++) {
//    const date = new Date(today);
//    date.setDate(today.getDate() + i);
//    const dateStr = formatDateISO(date);
//    const displayDate = formatDateDDMM(date);
//    const weekday = weekdays[date.getDay()];
//
//    // Считаем выезды и заезды для этого дня
//    const departures = allBookings.filter(b =>
//      b.status?.name !== "Отменен" &&
//      dateOnly(b.dates?.departure) === dateStr
//    ).length;
//
//    const arrivals = allBookings.filter(b =>
//      b.status?.name !== "Отменен" &&
//      dateOnly(b.dates?.arrival) === dateStr
//    ).length;
//
//    totalDepartures += departures;
//    totalArrivals += arrivals;
//
//    text += `${weekday} ${displayDate} | 🔴 ${departures} | 🟢 ${arrivals}\n`;
//  }
//
//  text += `\nВсего за неделю:\n`;
//  text += `🔴 Выездов: ${totalDepartures}\n`;
//  text += `🟢 Заездов: ${totalArrivals}`;
//
//  // Сохраняем в кэш
//  cache.weekStats = {
//    data: text,
//    expiresAt: Date.now() + CACHE_TTL
//  };
//  console.log('💾 Сохранено в кэш: weekStats');
//
//  return text;
//}
//
//// ---------- Получение кассового расписания ----------
//async function getCashSchedule(monthOffset = 0) {
//  console.log(`🌐 Запрос к API: кассовое расписание (месяц ${monthOffset >= 0 ? '+' + monthOffset : monthOffset})`);
//  const bearer = await getBearer();
//
//  // Определяем диапазон: текущий месяц + offset
//  const today = new Date();
//  const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
//
//  // Начало месяца
//  const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
//  // Конец месяца
//  const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
//
//  // Расширяем диапазон на 2 месяца назад для поиска броней (с учетом выездов в прошлом)
//  const searchStart = new Date(monthStart);
//  searchStart.setMonth(searchStart.getMonth() - 2);
//
//  const date_from = formatDateISO(searchStart);
//  const date_to = formatDateISO(monthEnd);
//
//  console.log(`   📅 Ищем платежи за: ${formatDateDDMM(monthStart)} - ${formatDateDDMM(monthEnd)}`);
//
//  // Получаем все выезды (checkedOut)
//  let allBookings = [];
//  let offset = 0;
//  const limit = 50;
//
//  while (true) {
//    const resp = await fetch(
//      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkedOut&limit=${limit}&offset=${offset}`,
//      {
//        headers: { Authorization: `Bearer ${bearer}` }
//      }
//    );
//
//    const data = await resp.json();
//    const bookingsPage = data.data?.bookings || [];
//    allBookings = allBookings.concat(bookingsPage);
//
//    if (bookingsPage.length < limit) {
//      break;
//    }
//
//    offset += limit;
//  }
//
//  console.log(`   📦 Получено выездов: ${allBookings.length}`);
//
//  // Обрабатываем бронирования
//  const payments = [];
//
//  for (const booking of allBookings) {
//    try {
//      // Пропускаем отмененные
//      if (booking.status?.name === "Отменен") continue;
//
//      const channel = booking.source?.name || "Неизвестно";
//
//      // Обрабатываем только настроенные каналы
//      if (!CHANNEL_CONFIG[channel]) continue;
//
//      const checkinDate = booking.dates?.arrival;
//      const checkoutDate = booking.dates?.departure;
//
//      if (!checkinDate || !checkoutDate) continue;
//
//      // Рассчитываем сумму
//      const prices = booking.prices || [];
//      const amount = prices.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);
//
//      if (amount === 0) continue;
//
//      // Рассчитываем дату поступления
//      const paymentDate = calculatePaymentDate(channel, checkinDate, checkoutDate);
//      const paymentDateStr = formatDateISO(paymentDate);
//
//      // Фильтруем только те платежи, которые попадают в целевой месяц
//      if (paymentDate >= monthStart && paymentDate <= monthEnd) {
//        const commission = calculateCommission(channel, amount);
//        const amountToReceive = calculateAmountToReceive(channel, amount);
//
//        payments.push({
//          date: paymentDateStr,
//          paymentDate: paymentDate,
//          channel: channel,
//          bookingNumber: booking.number || booking.id,
//          guest: `${booking.customer?.name || ''} ${booking.customer?.surname || ''}`.trim(),
//          amount: amount,
//          commission: commission,
//          amountToReceive: amountToReceive,
//          roomName: booking.room_name || ''
//        });
//      }
//    } catch (error) {
//      console.error(`   ⚠️ Ошибка обработки брони ${booking.number}:`, error.message);
//    }
//  }
//
//  // Сортируем по дате
//  payments.sort((a, b) => a.paymentDate - b.paymentDate);
//
//  console.log(`   💰 Платежей в месяце: ${payments.length}`);
//
//  // Формируем текст
//  const monthName = targetMonth.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
//  let text = `💰 Кассовое расписание\n${monthName}\n\n`;
//
//  if (payments.length === 0) {
//    text += "Платежей не запланировано ✅";
//    return { text, totalAmount: 0, totalCommission: 0, totalToReceive: 0, paymentsCount: 0 };
//  }
//
//  // Группируем по датам
//  const paymentsByDate = {};
//  for (const payment of payments) {
//    if (!paymentsByDate[payment.date]) {
//      paymentsByDate[payment.date] = [];
//    }
//    paymentsByDate[payment.date].push(payment);
//  }
//
//  // Общая статистика
//  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
//  const totalCommission = payments.reduce((sum, p) => sum + p.commission, 0);
//  const totalToReceive = payments.reduce((sum, p) => sum + p.amountToReceive, 0);
//
//  // Формируем список по датам
//  for (const [dateStr, datePayments] of Object.entries(paymentsByDate)) {
//    const date = new Date(dateStr);
//    const displayDate = formatDateDDMM(date);
//    const dayOfWeek = date.toLocaleString('ru-RU', { weekday: 'short' });
//
//    const dayTotal = datePayments.reduce((sum, p) => sum + p.amountToReceive, 0);
//
//    text += `📅 ${dayOfWeek} ${displayDate} — ${dayTotal.toFixed(0)} ₽\n`;
//
//    for (const payment of datePayments) {
//      text += `  ${payment.channel}\n`;
//      text += `  ${payment.roomName} ${payment.guest}\n`;
//      text += `  К получению: ${payment.amountToReceive.toFixed(0)} ₽\n\n`;
//    }
//  }
//
//  text += `\n📊 Итого за месяц:\n`;
//  text += `Платежей: ${payments.length}\n`;
//  text += `Сумма броней: ${totalAmount.toFixed(0)} ₽\n`;
//  text += `Комиссия: ${totalCommission.toFixed(0)} ₽\n`;
//  text += `К получению: ${totalToReceive.toFixed(0)} ₽`;
//
//  return {
//    text,
//    totalAmount,
//    totalCommission,
//    totalToReceive,
//    paymentsCount: payments.length
//  };
//}
//
//// ---------- Динамическая клавиатура ----------
//// Генерация календаря на неделю
//function getWeekKeyboard(weekOffset = 0) {
//  const today = new Date();
//
//  // Находим понедельник текущей недели
//  const currentDay = today.getDay(); // 0 = Вс, 1 = Пн, ..., 6 = Сб
//  const daysFromMonday = currentDay === 0 ? -6 : 1 - currentDay; // Если воскресенье, то -6, иначе 1-currentDay
//
//  const monday = new Date(today);
//  monday.setDate(today.getDate() + daysFromMonday);
//
//  // Добавляем смещение недель
//  monday.setDate(monday.getDate() + weekOffset * 7);
//
//  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
//  const buttons = [];
//
//  // Генерируем кнопки для 7 дней недели
//  for (let i = 0; i < 7; i++) {
//    const date = new Date(monday);
//    date.setDate(monday.getDate() + i);
//
//    const dateStr = formatDateISO(date);
//    const displayDate = formatDateDDMM(date);
//    const label = `${weekdays[i]} ${displayDate}`;
//
//    buttons.push([Keyboard.button.callback(label, `date:${dateStr}`)]);
//  }
//
//  // Добавляем навигацию
//  const navButtons = [];
//
//  if (weekOffset > 0) {
//    navButtons.push(Keyboard.button.callback("⬅ Предыдущая неделя", `calendar:${weekOffset - 1}`));
//  }
//
//  navButtons.push(Keyboard.button.callback("➡ Следующая неделя", `calendar:${weekOffset + 1}`));
//
//  buttons.push(navButtons);
//  buttons.push([Keyboard.button.callback("⬅ Назад", "cleaning_menu")]);
//
//  return Keyboard.inlineKeyboard(buttons);
//}
//
//function getCleaningKeyboard() {
//  const today = new Date();
//  const tomorrow = new Date(today);
//  tomorrow.setDate(today.getDate() + 1);
//
//  const todayLabel = `Сегодня (${formatDateDDMM(today)})`;
//  const tomorrowLabel = `Завтра (${formatDateDDMM(tomorrow)})`;
//
//  return Keyboard.inlineKeyboard([
//    [Keyboard.button.callback(todayLabel, "today")],
//    [Keyboard.button.callback(tomorrowLabel, "tomorrow")],
//    [Keyboard.button.callback("📅 Календарь", "calendar:0")],
//    [Keyboard.button.callback("📊 Статистика на неделю", "week_stats")],
//    [Keyboard.button.callback("Проживающие сегодня", "residents_today")],
//    [Keyboard.button.callback("⬅ Назад", "back")]
//  ]);
//}
//
//// Главное меню
//const mainKeyboard = Keyboard.inlineKeyboard([
//  [Keyboard.button.callback("Уборка", "cleaning_menu")],
//  [Keyboard.button.callback("💰 Кассовое расписание", "cash_schedule_menu")]
//]);
//
//// ---------- Команда /start ----------
//bot.command("start", async (ctx) => {
//  const message = await ctx.reply("Главное меню:", {
//    attachments: [mainKeyboard]
//  });
//
//  // Сохраняем ID первого сообщения
//  const userId = ctx.message?.sender?.user_id;
//  if (userId && message?.body?.mid) {
//    lastBotMessages.set(userId, message.body.mid);
//  }
//});
//
//// ---------- Обработчики кнопок ----------
//// Открытие подменю «Уборка»
//bot.action("cleaning_menu", async (ctx) => {
//  // Показываем меню сразу
//  await replyAndDeletePrevious(ctx, "Уборка:", {
//    attachments: [getCleaningKeyboard()]
//  });
//
//  // Запускаем предзагрузку кэша в фоне (не ждем завершения)
//  preloadCache().catch(err => {
//    console.error('Ошибка фоновой предзагрузки:', err.message);
//  });
//});
//
//// Сегодня
//bot.action("today", async (ctx) => {
//  try {
//    const dateStr = formatDateISO(new Date());
//    const result = await getBookings(dateStr, true); // true = со статусами
//
//    // Создаем клавиатуру: кнопки статусов + сброс + навигация
//    const keyboard = Keyboard.inlineKeyboard([
//      ...result.statusButtons,
//      [Keyboard.button.callback("🔄 Сбросить прогресс", "reset_progress")],
//      [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//    ]);
//
//    await replyAndDeletePrevious(ctx, result.text, {
//      attachments: [keyboard]
//    });
//  } catch (error) {
//    console.error("❌ Ошибка в обработчике 'today':", error.message);
//    await replyAndDeletePrevious(ctx, `❌ Ошибка загрузки данных:\n${error.message}\n\nПопробуйте позже или обратитесь к администратору.`, {
//      attachments: [Keyboard.inlineKeyboard([
//        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//      ])]
//    });
//  }
//});
//
//// Завтра
//bot.action("tomorrow", async (ctx) => {
//  const date = new Date();
//  date.setDate(date.getDate() + 1);
//  const dateStr = formatDateISO(date);
//
//  const result = await getBookings(dateStr, false); // false = без статусов
//
//  // Создаем клавиатуру: только навигация
//  const keyboard = Keyboard.inlineKeyboard([
//    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//  ]);
//
//  await replyAndDeletePrevious(ctx, result.text, {
//    attachments: [keyboard]
//  });
//});
//
//// Проживающие сегодня
//bot.action("residents_today", async (ctx) => {
//  const dateStr = formatDateISO(new Date());
//  const text = await getResidents(dateStr);
//
//  const keyboard = Keyboard.inlineKeyboard([
//    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//  ]);
//
//  await replyAndDeletePrevious(ctx, text, {
//    attachments: [keyboard]
//  });
//});
//
//// Статистика на неделю
//bot.action("week_stats", async (ctx) => {
//  const text = await getWeekStats();
//
//  const keyboard = Keyboard.inlineKeyboard([
//    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//  ]);
//
//  await replyAndDeletePrevious(ctx, text, {
//    attachments: [keyboard]
//  });
//});
//
//// Календарь - показ недели
//bot.action(/calendar:(-?\d+)/, async (ctx) => {
//  const weekOffset = parseInt(ctx.match[1], 10);
//
//  await replyAndDeletePrevious(ctx, "Выберите дату:", {
//    attachments: [getWeekKeyboard(weekOffset)]
//  });
//});
//
//// Выбор конкретной даты из календаря
//bot.action(/date:(.+)/, async (ctx) => {
//  try {
//    const dateStr = ctx.match[1];
//    const today = formatDateISO(new Date());
//
//    // Показываем статусы только для сегодняшней даты
//    const showStatuses = dateStr === today;
//    const result = await getBookings(dateStr, showStatuses);
//
//    // Создаем клавиатуру
//    let keyboard;
//    if (showStatuses) {
//      // Для сегодня: кнопки статусов + сброс + назад
//      keyboard = Keyboard.inlineKeyboard([
//        ...result.statusButtons,
//        [Keyboard.button.callback("🔄 Сбросить прогресс", "reset_progress")],
//        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//      ]);
//    } else {
//      // Для других дат: только назад
//      keyboard = Keyboard.inlineKeyboard([
//        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//      ]);
//    }
//
//    await replyAndDeletePrevious(ctx, result.text, {
//      attachments: [keyboard]
//    });
//  } catch (error) {
//    console.error("❌ Ошибка в обработчике 'date':", error.message);
//    await replyAndDeletePrevious(ctx, `❌ Ошибка загрузки данных:\n${error.message}\n\nПопробуйте позже или обратитесь к администратору.`, {
//      attachments: [Keyboard.inlineKeyboard([
//        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//      ])]
//    });
//  }
//});
//
//// Изменение статуса уборки номера
//bot.action(/status:(.+):(.+):(not_started|in_progress|done)/, async (ctx) => {
//  const dateStr = ctx.match[1];
//  const roomName = ctx.match[2];
//  const newStatus = ctx.match[3];
//
//  // Сохраняем новый статус
//  await setRoomStatus(dateStr, roomName, newStatus);
//
//  // Обновляем отображение
//  const result = await getBookings(dateStr, true); // true = со статусами
//
//  const keyboard = Keyboard.inlineKeyboard([
//    ...result.statusButtons,
//    [Keyboard.button.callback("🔄 Сбросить прогресс", "reset_progress")],
//    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
//  ]);
//
//  await replyAndDeletePrevious(ctx, result.text, {
//    attachments: [keyboard]
//  });
//});
//
//// Сброс всех статусов
//bot.action("reset_progress", async (ctx) => {
//  await resetAllStatuses();
//  clearAllCache(); // Очищаем кэш
//
//  await replyAndDeletePrevious(ctx, "✅ Весь прогресс сброшен!\n\nВыберите действие:", {
//    attachments: [getCleaningKeyboard()]
//  });
//});
//
//// Назад в главное меню
//bot.action("back", async (ctx) => {
//  await replyAndDeletePrevious(ctx, "Главное меню:", {
//    attachments: [mainKeyboard]
//  });
//});
//
//// ---------- Обработчики кассового расписания ----------
//// Меню кассового расписания
//bot.action("cash_schedule_menu", async (ctx) => {
//  const today = new Date();
//  const currentMonth = today.toLocaleString('ru-RU', { month: 'long' });
//  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).toLocaleString('ru-RU', { month: 'long' });
//
//  const keyboard = Keyboard.inlineKeyboard([
//    [Keyboard.button.callback(`Текущий месяц (${currentMonth})`, "cash_month:0")],
//    [Keyboard.button.callback(`Следующий месяц (${nextMonth})`, "cash_month:1")],
//    [Keyboard.button.callback("⬅ Назад", "back")]
//  ]);
//
//  await replyAndDeletePrevious(ctx, "💰 Кассовое расписание\n\nВыберите месяц:", {
//    attachments: [keyboard]
//  });
//});
//
//// Показ расписания за месяц
//bot.action(/cash_month:(-?\d+)/, async (ctx) => {
//  try {
//    const monthOffset = parseInt(ctx.match[1], 10);
//
//    const result = await getCashSchedule(monthOffset);
//
//    const keyboard = Keyboard.inlineKeyboard([
//      [Keyboard.button.callback("⬅ Назад к выбору месяца", "cash_schedule_menu")]
//    ]);
//
//    await replyAndDeletePrevious(ctx, result.text, {
//      attachments: [keyboard]
//    });
//  } catch (error) {
//    console.error("❌ Ошибка в обработчике 'cash_month':", error.message);
//    await replyAndDeletePrevious(ctx, `❌ Ошибка загрузки данных:\n${error.message}\n\nПопробуйте позже или обратитесь к администратору.`, {
//      attachments: [Keyboard.inlineKeyboard([
//        [Keyboard.button.callback("⬅ Назад", "cash_schedule_menu")]
//      ])]
//    });
//  }
//});
//
//// ---------- Запуск ----------
//
//bot.start();
//
//
//
import 'dotenv/config';
import { Bot, Keyboard } from '@maxhub/max-bot-api';
import fs from 'fs/promises';

const bot = new Bot(process.env.BOT_TOKEN);

// Храним ID последних сообщений бота для каждого пользователя
const lastBotMessages = new Map();

// Путь к файлу со статусами уборки
const CLEANING_STATUS_FILE = './cleaning_status.json';

// Путь к файлу со статусами платежей
const PAYMENT_STATUS_FILE = './payment_status.json';

// ---------- Кэширование данных ----------
const CACHE_TTL = 10 * 60 * 1000; // 10 минут

const cache = {
  bookings: new Map(),      // Кэш бронирований {date: {data, expiresAt}}
  residents: new Map(),     // Кэш проживающих {date: {data, expiresAt}}
  weekStats: null,          // Кэш статистики на неделю {data, expiresAt}
};

// Проверка валидности кэша
function isCacheValid(cacheEntry) {
  return cacheEntry && Date.now() < cacheEntry.expiresAt;
}

// Получить данные из кэша
function getCached(cacheMap, key) {
  let entry;

  if (key === null) {
    // Для weekStats (объект, не Map)
    entry = cacheMap;
  } else {
    // Для Map (bookings, residents)
    entry = cacheMap.get(key);
  }

  if (isCacheValid(entry)) {
    console.log(`⚡️ Из кэша: ${key || 'weekStats'}`);
    return entry.data;
  }
  return null;
}

// Сохранить данные в кэш
function setCached(cacheMap, key, data) {
  const entry = {
    data: data,
    expiresAt: Date.now() + CACHE_TTL
  };

  if (key === null) {
    // Для weekStats - это обрабатывается отдельно в getWeekStats
    return;
  } else {
    // Для Map (bookings, residents)
    cacheMap.set(key, entry);
  }

  console.log(`💾 Сохранено в кэш: ${key || 'weekStats'}`);
}

// Очистить весь кэш
function clearAllCache() {
  cache.bookings.clear();
  cache.residents.clear();
  cache.weekStats = null;
  console.log('🔄 Кэш полностью очищен');
}

// Предзагрузка кэша (загружаем все данные заранее)
async function preloadCache() {
  console.log('🔄 Начинаем предзагрузку кэша...');

  const today = formatDateISO(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDateISO(tomorrow);

  // Запускаем все запросы параллельно
  try {
    await Promise.all([
      getBookings(today, true),        // Сегодня
      getBookings(tomorrowStr, false), // Завтра
      getResidents(today),             // Проживающие
      getWeekStats()                   // Статистика
    ]);
    console.log('✅ Предзагрузка кэша завершена');
  } catch (error) {
    console.error('❌ Ошибка предзагрузки кэша:', error.message);
  }
}

// ---------- Работа со статусами уборки ----------
// Чтение статусов из файла
async function readCleaningStatus() {
  try {
    const data = await fs.readFile(CLEANING_STATUS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Файл не существует или ошибка - возвращаем пустой объект
    return {};
  }
}

// Запись статусов в файл
async function saveCleaningStatus(statuses) {
  await fs.writeFile(CLEANING_STATUS_FILE, JSON.stringify(statuses, null, 2), 'utf-8');
}

// Получить статус конкретного номера на дату
async function getRoomStatus(date, roomName) {
  const statuses = await readCleaningStatus();
  return statuses[date]?.[roomName] || 'not_started';
}

// Установить статус номера
async function setRoomStatus(date, roomName, status) {
  const statuses = await readCleaningStatus();

  if (!statuses[date]) {
    statuses[date] = {};
  }

  statuses[date][roomName] = status;
  await saveCleaningStatus(statuses);
}

// Сбросить все статусы
async function resetAllStatuses() {
  await saveCleaningStatus({});
}

// Получить эмодзи для статуса
function getStatusEmoji(status) {
  switch (status) {
    case 'not_started': return '⚪️';
    case 'in_progress': return '⏳';
    case 'done': return '✅';
    default: return '⚪️';
  }
}

// Получить текст для статуса
function getStatusText(status) {
  switch (status) {
    case 'not_started': return 'Не начато';
    case 'in_progress': return 'В процессе';
    case 'done': return 'Убрано';
    default: return 'Не начато';
  }
}

// ---------- Работа со статусами платежей ----------
// Чтение статусов платежей
async function readPaymentStatus() {
  try {
    const data = await fs.readFile(PAYMENT_STATUS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

// Запись статусов платежей
async function savePaymentStatus(statuses) {
  await fs.writeFile(PAYMENT_STATUS_FILE, JSON.stringify(statuses, null, 2), 'utf-8');
}

// Получить статус платежа на дату для месяца
async function getPaymentStatus(monthKey, date) {
  const statuses = await readPaymentStatus();
  return statuses[monthKey]?.[date] || 'pending'; // pending или received
}

// Установить статус платежа на дату
async function setPaymentStatus(monthKey, date, status) {
  const statuses = await readPaymentStatus();

  if (!statuses[monthKey]) {
    statuses[monthKey] = {};
  }

  statuses[monthKey][date] = status;
  await savePaymentStatus(statuses);
}

// ---------- Настройки PMS ----------
const PMS_ID = process.env.PMS_ID;
const PMS_PASSWORD = process.env.PMS_PASSWORD;
// ---------- Конфигурация комиссий ----------
const CHANNEL_CONFIG = {
  "Яндекс Путешествия (новая версия)": {
    commission_rate: 0.25,
    days_offset: 14,
    special_date_rule: null,
    note: "цена неточная, примерная, так как ЯП работают некорректно. комиссия от 15% до 25%"
  },
  "Roomlink (ранее — Забронируй.ру)": {
    commission_rate: 0.23,
    days_offset: 0,
    special_date_rule: "17th_after_checkout",
    note: "✓ уточняется способ оплаты, автоплатеж с 5-15 число"
  },
  "ТВИЛ": {
    commission_rate: 0.20,
    days_offset: 0,
    special_date_rule: "checkin_date",
    note: "✓ комиссия аванс на сайте, остальное наличными"
  },
  "Прямое": {
    commission_rate: 0.15,
    days_offset: 0,
    special_date_rule: "checkin_date",
    note: "✓ аванс+оплата"
  },
  "Модуль бронирования": {
    commission_rate: 0.15,
    days_offset: 0,
    special_date_rule: "checkin_date",
    note: "✓ аванс+оплата"
  },
  "Otello": {
    commission_rate: 0.15,
    days_offset: 5,
    special_date_rule: null,
    note: "✓ автоплатеж через 2-5 дней после брони"
  },
  "101hotels.com": {
    commission_rate: 0.15,
    days_offset: 0,
    special_date_rule: "17th_after_checkout",
    note: "присылают после взаимозачета с 1-15 число"
  },
  "Островок!": {
    commission_rate: 0.15,
    days_offset: 0,
    special_date_rule: "25th_after_checkout",
    note: "✓ автоплатеж 25 числа"
  },
  "Mirturbaz": {
    commission_rate: 0.15,
    days_offset: 0,
    special_date_rule: "25th_after_checkout",
    note: "✓ автоплатеж уточняется дата оплаты"
  },
  "OneTwoTrip!": {
    commission_rate: 0.20,
    days_offset: 0,
    special_date_rule: "15th_after_checkout",
    note: "✓ автоплатеж с 5-15 число"
  },
  "Суточно.ру": {
    commission_rate: 0.20,
    days_offset: 0,
    special_date_rule: "checkin_date",
    note: "✓ аванс на сайте+наличными"
  },
  "Avito": {
    commission_rate: 0.20,
    days_offset: 0,
    special_date_rule: "checkin_date",
    note: "✓ комиссия аванс на сайте, остальное наличными"
  }
};

// Расчет комиссии
function calculateCommission(channel, amount) {
  const config = CHANNEL_CONFIG[channel];
  if (!config) return 0;
  return amount * config.commission_rate;
}

// Расчет суммы к получению
function calculateAmountToReceive(channel, amount) {
  const commission = calculateCommission(channel, amount);
  return amount - commission;
}

// Расчет даты поступления оплаты
function calculatePaymentDate(channel, checkinDate, checkoutDate) {
  const config = CHANNEL_CONFIG[channel];
  if (!config) return new Date(checkinDate);

  const rule = config.special_date_rule;
  const checkoutDateObj = new Date(checkoutDate);

    if (rule === "17th_after_checkout") {
      const payout = new Date(checkoutDateObj);
      payout.setDate(1); // важно, чтобы не было багов с концом месяца
      payout.setMonth(payout.getMonth() + 1);
      payout.setDate(17);
      return payout;
    }

      if (rule === "25th_after_checkout") {
      const payout = new Date(checkoutDateObj);
      payout.setDate(1); // защита от переполнения месяца
      payout.setMonth(payout.getMonth() + 1);
      payout.setDate(25);
      return payout;
    }

    if (rule === "15th_after_checkout") {
      const payout = new Date(checkoutDateObj);
      payout.setDate(1); // защита от переполнения месяца
      payout.setMonth(payout.getMonth() + 1);
      payout.setDate(15);
      return payout;
    }

  if (rule === "checkin_date") {
    return new Date(checkinDate);
  }

  // Иначе используем days_offset от даты выезда
  const paymentDate = new Date(checkoutDateObj);
  paymentDate.setDate(paymentDate.getDate() + (config.days_offset || 0));
  return paymentDate;
}

// ---------- Вспомогательные функции ----------
// Склонение слова "человек"
function pluralize(count) {
  const cases = [2, 0, 1, 1, 1, 2];
  const titles = ['человек', 'человека', 'человек'];
  return titles[
    count % 100 > 4 && count % 100 < 20
      ? 2
      : cases[Math.min(count % 10, 5)]
  ];
}

// Форматирование даты в ДД.ММ
function formatDateDDMM(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}.${m}`;
}

// Форматирование даты в YYYY-MM-DD
function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Сокращение названия номера для кнопок
function shortenRoomName(roomName) {
  if (!roomName) return roomName;

  const name = roomName.toString();

  // Коттедж №1 → К1
  if (name.includes("Коттедж")) {
    const match = name.match(/(\d+)/);
    if (match) {
      return `К${match[1]}`;
    }
  }

  // Мотель №1 → М1
  if (name.includes("Мотель")) {
    const match = name.match(/(\d+)/);
    if (match) {
      return `М${match[1]}`;
    }
  }

  // Для других названий - возвращаем как есть
  return name;
}

// Сортировка по названию номера
function sortByRoomName(bookings) {
  return bookings.sort((a, b) => {
    const nameA = (a.room_name || "").toString();
    const nameB = (b.room_name || "").toString();
    return nameA.localeCompare(nameB, 'ru', { numeric: true, sensitivity: 'base' });
  });
}

// Функция отправки сообщения с удалением предыдущего
async function replyAndDeletePrevious(ctx, text, options = {}) {
  const userId = ctx.user?.user_id || ctx.message?.sender?.user_id;

  if (!userId) {
    // Если не можем определить пользователя, просто отправляем
    return await ctx.reply(text, options);
  }

  // Удаляем предыдущее сообщение, если оно есть
  const previousMessageId = lastBotMessages.get(userId);
  if (previousMessageId) {
    try {
      // Используем правильный формат с query-параметрами
      const response = await fetch(
        `https://platform-api.max.ru/messages?message_id=${previousMessageId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': process.env.BOT_TOKEN
          }
        }
      );

      if (!response.ok) {
        console.log('Не удалось удалить сообщение, статус:', response.status);
      }
    } catch (error) {
      // Игнорируем ошибки удаления (сообщение могло быть уже удалено или старше 24 часов)
      console.log('Ошибка при удалении сообщения:', error.message);
    }
  }

  // Отправляем новое сообщение
  const newMessage = await ctx.reply(text, options);

  // Сохраняем ID нового сообщения
  if (newMessage?.body?.mid) {
    lastBotMessages.set(userId, newMessage.body.mid);
  }

  return newMessage;
}

// ---------- Авторизация ----------
async function getBearer() {
  try {
    const resp = await fetch("https://api.pms.bnovo.ru/api/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: PMS_ID,
        password: PMS_PASSWORD
      })
    });

    const data = await resp.json();

    if (!data.data) {
      throw new Error("Ошибка авторизации: " + (data.message || "неизвестная ошибка"));
    }

    return data.data.access_token;
  } catch (error) {
    console.error("❌ Ошибка при получении токена:", error.message);
    throw error;
  }
}

// ---------- Получение бронирований ----------
async function getBookings(targetDate, showStatuses = true) {
  // Проверяем кэш
  const cacheKey = `bookings_${targetDate}`;
  const cached = getCached(cache.bookings, cacheKey);

  if (cached) {
    // Есть в кэше - генерируем отображение со свежими статусами
    return await generateBookingsDisplay(cached.departures, cached.arrivals, targetDate, showStatuses);
  }

  // Кэша нет - запрашиваем API
  console.log(`🌐 Запрос к API: бронирования на ${targetDate}`);
  const bearer = await getBearer();

  // Диапазон: день назад → целевая дата
  // Это захватит все брони пересекающиеся с целевой датой
  const targetDateObj = new Date(targetDate);
  const dayBeforeObj = new Date(targetDateObj);
  dayBeforeObj.setDate(targetDateObj.getDate() - 1);

  const date_from = formatDateISO(dayBeforeObj);
  const date_to = targetDate;

  // Используем checkmate - вернёт все брони пересекающиеся с диапазоном
  let allBookings = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const resp = await fetch(
      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkmate&limit=${limit}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${bearer}`
        }
      }
    );

    const data = await resp.json();
    const bookingsPage = data.data?.bookings || [];
    allBookings = allBookings.concat(bookingsPage);

    if (bookingsPage.length < limit) {
      break;
    }

    offset += limit;
  }

  // Вручную фильтруем выезды и заезды
  const departures = allBookings.filter(
    (b) =>
      b.status?.name !== "Отменен" &&
      b.dates?.departure?.substring(0, 10) === targetDate
  );

  const arrivals = allBookings.filter(
    (b) =>
      b.status?.name !== "Отменен" &&
      b.dates?.arrival?.substring(0, 10) === targetDate
  );

  // Сортируем по номерам
  sortByRoomName(departures);
  sortByRoomName(arrivals);

  // Сохраняем в кэш
  setCached(cache.bookings, cacheKey, { departures, arrivals });

  // Генерируем отображение
  return await generateBookingsDisplay(departures, arrivals, targetDate, showStatuses);
}

// Генерация отображения бронирований (для кэша)
async function generateBookingsDisplay(departures, arrivals, targetDate, showStatuses) {
  // Форматируем дату для заголовка
  const displayDate = formatDateDDMM(new Date(targetDate));

  let text = `📅 Движение на ${displayDate}\n`;
  text += `Всего выездов: ${departures.length} | Всего заездов: ${arrivals.length}\n\n`;

  // Клавиатура с кнопками статусов
  const statusButtons = [];

  // Блок 1 — выезды
  text += "🔴 Выезды:\n";
  if (departures.length === 0) {
    text += "Выездов нет ✅\n\n";
  } else {
    for (const b of departures) {
      const adults = b.extra?.adults || 0;
      const guestName = "";
//      `${b.customer?.name || ""} ${b.customer?.surname || ""}`.trim();

      if (showStatuses) {
        // Показываем статус и добавляем кнопки
        const status = await getRoomStatus(targetDate, b.room_name);
        const statusEmoji = getStatusEmoji(status);

        text += `${statusEmoji} ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})\n`;

        // Сокращаем название для кнопок
        const shortName = shortenRoomName(b.room_name);

        // Добавляем ряд кнопок для этого номера
        statusButtons.push([
          Keyboard.button.callback(
            `${shortName}⚪️`,
            `status:${targetDate}:${b.room_name}:not_started`
          ),
          Keyboard.button.callback(
            `${shortName}⏳`,
            `status:${targetDate}:${b.room_name}:in_progress`
          ),
          Keyboard.button.callback(
            `${shortName}✅`,
            `status:${targetDate}:${b.room_name}:done`
          )
        ]);
      } else {
        // Без статусов - просто список
        text += `• ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})\n`;
      }

      text += "\n";
    }
  }

  // Блок 2 — заезды
  text += "🟢 Заезды:\n";
  if (arrivals.length === 0) {
    text += "Заездов нет ✅\n\n";
  } else {
    for (const b of arrivals) {
      const adults = b.extra?.adults || 0;
      const guestName = `${b.customer?.name || ""} ${b.customer?.surname || ""}`.trim();
      text += `• ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})\n\n`;
    }
  }

  return { text, statusButtons, targetDate };
}

// ---------- Получение проживающих ----------
async function getResidents(targetDateStr) {
  // Проверяем кэш
  const cacheKey = `residents_${targetDateStr}`;
  const cached = getCached(cache.residents, cacheKey);

  if (cached) {
    // Есть в кэше - возвращаем
    return cached;
  }

  // Кэша нет - запрашиваем API
  console.log(`🌐 Запрос к API: проживающие на ${targetDateStr}`);
  const bearer = await getBearer();

  const targetDateObj = new Date(targetDateStr);

  // Диапазон: день назад → целевая дата
  const dayBeforeObj = new Date(targetDateObj);
  dayBeforeObj.setDate(targetDateObj.getDate() - 1);

  const date_from = formatDateISO(dayBeforeObj);
  const date_to = targetDateStr;

  // Получаем все бронирования с пагинацией
  let offset = 0;
  const limit = 50;
  let allBookings = [];

  while (true) {
    const resp = await fetch(
      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkmate&limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${bearer}` }
      }
    );

    const data = await resp.json();
    const bookingsPage = data.data?.bookings || [];
    allBookings = allBookings.concat(bookingsPage);

    if (bookingsPage.length < limit) {
      break;
    }

    offset += limit;
  }

  const displayDate = formatDateDDMM(new Date(targetDateStr));
  let text = `🏡 Проживающие ${displayDate}\n\n`;

  const dateOnly = (isoLike) => (isoLike ? String(isoLike).substring(0, 10) : "");

  // Условие: arrival_date <= today < departure_date
  // Также включаем тех, кто заехал сегодня (arrival = today)
  // НЕ включаем тех, кто ТОЛЬКО выезжает сегодня (arrival < today && departure = today)
  const residents = allBookings.filter(b => {
    if (b.status?.name === "Отменен") return false;

    const arrivalDate = dateOnly(b.dates?.arrival);
    const departureDate = dateOnly(b.dates?.departure);

    if (!arrivalDate || !departureDate) return false;

    // Гость проживает, если arrival <= today < departure
    const isResiding = arrivalDate <= targetDateStr && targetDateStr < departureDate;

    return isResiding;
  });

  if (residents.length === 0) {
    text += "Никто не проживает ✅";
  } else {
    // Сортируем по названию номера
    sortByRoomName(residents);

    text += "Проживающие:\n";
    for (const b of residents) {
      const arrivalDate = dateOnly(b.dates?.arrival);
      const adults = b.extra?.adults || 0;
      const guestName = `${b.customer?.name || ""} ${b.customer?.surname || ""}`.trim();

      // Отметка "заезд сегодня"
      const arrivalTag = arrivalDate === targetDateStr ? " (заезд сегодня)" : "";

      text += `• ${b.room_name} ${guestName} (${adults} ${pluralize(adults)})${arrivalTag}\n\n`;
    }
  }

  // Сохраняем в кэш
  setCached(cache.residents, cacheKey, text);

  return text;
}

// ---------- Получение статистики на неделю ----------
async function getWeekStats() {
  // Проверяем кэш
  const cached = getCached(cache.weekStats, null);

  if (cached) {
    // Есть в кэше - возвращаем
    return cached;
  }

  // Кэша нет - запрашиваем API
  console.log('🌐 Запрос к API: статистика на неделю');
  const bearer = await getBearer();

  const today = new Date();

  // Диапазон: сегодня + 7 дней вперёд
  // data_type=checkmate вернёт все брони пересекающиеся с этим диапазоном
  const fromDateObj = new Date(today);
  const toDateObj = new Date(today);
  toDateObj.setDate(today.getDate() + 6); // +6 дней = 7 дней всего

  const date_from = formatDateISO(fromDateObj);
  const date_to = formatDateISO(toDateObj);

  // Получаем все бронирования с пагинацией
  let offset = 0;
  const limit = 50;
  let allBookings = [];

  while (true) {
    const resp = await fetch(
      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkmate&limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${bearer}` }
      }
    );

    const data = await resp.json();
    const bookingsPage = data.data?.bookings || [];
    allBookings = allBookings.concat(bookingsPage);

    if (bookingsPage.length < limit) {
      break;
    }

    offset += limit;
  }

  const dateOnly = (isoLike) => (isoLike ? String(isoLike).substring(0, 10) : "");

  let text = "📊 Статистика на неделю\n\n";

  const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  let totalDepartures = 0;
  let totalArrivals = 0;

  // Проходим по 7 дням начиная с сегодня
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = formatDateISO(date);
    const displayDate = formatDateDDMM(date);
    const weekday = weekdays[date.getDay()];

    // Считаем выезды и заезды для этого дня
    const departures = allBookings.filter(b =>
      b.status?.name !== "Отменен" &&
      dateOnly(b.dates?.departure) === dateStr
    ).length;

    const arrivals = allBookings.filter(b =>
      b.status?.name !== "Отменен" &&
      dateOnly(b.dates?.arrival) === dateStr
    ).length;

    totalDepartures += departures;
    totalArrivals += arrivals;

    text += `${weekday} ${displayDate} | 🔴 ${departures} | 🟢 ${arrivals}\n`;
  }

  text += `\nВсего за неделю:\n`;
  text += `🔴 Выездов: ${totalDepartures}\n`;
  text += `🟢 Заездов: ${totalArrivals}`;

  // Сохраняем в кэш
  cache.weekStats = {
    data: text,
    expiresAt: Date.now() + CACHE_TTL
  };
  console.log('💾 Сохранено в кэш: weekStats');

  return text;
}

// ---------- Получение кассового расписания ----------
async function getCashSchedule(monthOffset = 0) {
  console.log(`🌐 Запрос к API: кассовое расписание (месяц ${monthOffset >= 0 ? '+' + monthOffset : monthOffset})`);
  const bearer = await getBearer();

  // Определяем диапазон: текущий месяц + offset
  const today = new Date();
  const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

  // Начало месяца
  const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
  // Конец месяца
  const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

  // Ключ месяца для хранения статусов
  const monthKey = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;

  // Расширяем диапазон на 2 месяца назад для поиска броней
  const searchStart = new Date(monthStart);
  searchStart.setMonth(searchStart.getMonth() - 2);

  const date_from = formatDateISO(searchStart);
  const date_to = formatDateISO(monthEnd);

  console.log(`   📅 Ищем платежи за: ${formatDateDDMM(monthStart)} - ${formatDateDDMM(monthEnd)}`);

  // Получаем все выезды (checkedOut)
  let allBookings = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const resp = await fetch(
      `https://api.pms.bnovo.ru/api/v1/bookings?date_from=${date_from}&date_to=${date_to}&data_type=checkedOut&limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${bearer}` }
      }
    );

    const data = await resp.json();
    const bookingsPage = data.data?.bookings || [];
    allBookings = allBookings.concat(bookingsPage);

    if (bookingsPage.length < limit) {
      break;
    }

    offset += limit;
  }

  console.log(`   📦 Получено выездов: ${allBookings.length}`);

  // Обрабатываем бронирования
  const payments = [];

  for (const booking of allBookings) {
    try {
      if (booking.status?.name === "Отменен") continue;

      const channel = booking.source?.name || "Неизвестно";
      if (!CHANNEL_CONFIG[channel]) continue;

      const checkinDate = booking.dates?.arrival;
      const checkoutDate = booking.dates?.departure;
      if (!checkinDate || !checkoutDate) continue;

      const prices = booking.prices || [];
      const amount = prices.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);
      if (amount === 0) continue;

      const paymentDate = calculatePaymentDate(channel, checkinDate, checkoutDate);
      const paymentDateStr = formatDateISO(paymentDate);

      if (paymentDate >= monthStart && paymentDate <= monthEnd) {
        const commission = calculateCommission(channel, amount);
        const amountToReceive = calculateAmountToReceive(channel, amount);

        payments.push({
          date: paymentDateStr,
          paymentDate: paymentDate,
          channel: channel,
          bookingNumber: booking.number || booking.id,
          guest: `${booking.customer?.name || ''} ${booking.customer?.surname || ''}`.trim(),
          amount: amount,
          commission: commission,
          amountToReceive: amountToReceive,
          roomName: booking.room_name || ''
        });
      }
    } catch (error) {
      console.error(`   ⚠️ Ошибка обработки брони ${booking.number}:`, error.message);
    }
  }

  payments.sort((a, b) => a.paymentDate - b.paymentDate);

  console.log(`   💰 Платежей в месяце: ${payments.length}`);

  const monthName = targetMonth.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
  let text = `💰 Кассовое расписание\n${monthName}\n\n`;

  if (payments.length === 0) {
    text += "Платежей не запланировано ✅";
    return {
      text,
      monthKey,
      statusButtons: [],
      totalReceived: 0,
      totalPending: 0
    };
  }

  // Группируем по датам
  const paymentsByDate = {};
  for (const payment of payments) {
    if (!paymentsByDate[payment.date]) {
      paymentsByDate[payment.date] = [];
    }
    paymentsByDate[payment.date].push(payment);
  }

  // Загружаем статусы платежей для этого месяца
  const paymentStatuses = await readPaymentStatus();
  const monthStatuses = paymentStatuses[monthKey] || {};

  // Подсчет сумм по статусам
  let totalReceived = 0;
  let totalPending = 0;

  // Кнопки для смены статусов (по датам)
  const statusButtons = [];

  // Формируем список по датам
  for (const [dateStr, datePayments] of Object.entries(paymentsByDate)) {
    const date = new Date(dateStr);
    const displayDate = formatDateDDMM(date);
    const dayOfWeek = date.toLocaleString('ru-RU', { weekday: 'short' });

    const dayTotal = datePayments.reduce((sum, p) => sum + p.amountToReceive, 0);

    // Получаем статус для этой даты
    const dateStatus = monthStatuses[dateStr] || 'pending';
    const statusEmoji = dateStatus === 'received' ? '✅' : '⏳';

    // Добавляем к соответствующей сумме
    if (dateStatus === 'received') {
      totalReceived += dayTotal;
    } else {
      totalPending += dayTotal;
    }

    text += `${statusEmoji} ${dayOfWeek} ${displayDate} — ${Math.round(dayTotal)} ₽\n`;

    // Сокращаем вывод - только номера и суммы
    for (const payment of datePayments) {
      const shortRoom = shortenRoomName(payment.roomName);
      const shortChannel = payment.channel
        .replace('Яндекс Путешествия (новая версия)', 'ЯндексП')
        .replace('Roomlink (ранее — Забронируй.ру)', 'Roomlink')
        .replace('OneTwoTrip!', '12T')
        .replace('Островок!', 'Островок')
        .replace('Модуль бронирования', 'МодульБ')
        .replace('101hotels.com', '101h')
        .replace('Суточно.ру', 'Суточно');

      text += `${shortRoom} ${shortChannel} ${Math.round(payment.amountToReceive)}₽\n`;
    }

    // Добавляем кнопки для смены статуса этой даты
    statusButtons.push([
      Keyboard.button.callback(
        `${displayDate} ⏳ Ожидаем`,
        `pay:${monthKey}:${dateStr}:pending`
      ),
      Keyboard.button.callback(
        `${displayDate} ✅ Поступило`,
        `pay:${monthKey}:${dateStr}:received`
      )
    ]);

    text += '\n';
  }

  text += `📊 Итого: ${Math.round(totalPending+totalReceived)} ₽\n`;
  text += `✅ Поступило: ${Math.round(totalReceived)} ₽\n`;
  text += `⏳ Ожидаем: ${Math.round(totalPending)} ₽`;

  return {
    text,
    monthKey,
    statusButtons,
    totalReceived,
    totalPending
  };
}

// ---------- Динамическая клавиатура ----------
// Генерация календаря на неделю
function getWeekKeyboard(weekOffset = 0) {
  const today = new Date();

  // Находим понедельник текущей недели
  const currentDay = today.getDay(); // 0 = Вс, 1 = Пн, ..., 6 = Сб
  const daysFromMonday = currentDay === 0 ? -6 : 1 - currentDay; // Если воскресенье, то -6, иначе 1-currentDay

  const monday = new Date(today);
  monday.setDate(today.getDate() + daysFromMonday);

  // Добавляем смещение недель
  monday.setDate(monday.getDate() + weekOffset * 7);

  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const buttons = [];

  // Генерируем кнопки для 7 дней недели
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);

    const dateStr = formatDateISO(date);
    const displayDate = formatDateDDMM(date);
    const label = `${weekdays[i]} ${displayDate}`;

    buttons.push([Keyboard.button.callback(label, `date:${dateStr}`)]);
  }

  // Добавляем навигацию
  const navButtons = [];

  if (weekOffset > 0) {
    navButtons.push(Keyboard.button.callback("⬅ Предыдущая неделя", `calendar:${weekOffset - 1}`));
  }

  navButtons.push(Keyboard.button.callback("➡ Следующая неделя", `calendar:${weekOffset + 1}`));

  buttons.push(navButtons);
  buttons.push([Keyboard.button.callback("⬅ Назад", "cleaning_menu")]);

  return Keyboard.inlineKeyboard(buttons);
}

function getCleaningKeyboard() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayLabel = `Сегодня (${formatDateDDMM(today)})`;
  const tomorrowLabel = `Завтра (${formatDateDDMM(tomorrow)})`;

  return Keyboard.inlineKeyboard([
    [Keyboard.button.callback(todayLabel, "today")],
    [Keyboard.button.callback(tomorrowLabel, "tomorrow")],
    [Keyboard.button.callback("📅 Календарь", "calendar:0")],
    [Keyboard.button.callback("📊 Статистика на неделю", "week_stats")],
    [Keyboard.button.callback("Проживающие сегодня", "residents_today")],
    [Keyboard.button.callback("⬅ Назад", "back")]
  ]);
}

// Главное меню
const mainKeyboard = Keyboard.inlineKeyboard([
  [Keyboard.button.callback("Уборка", "cleaning_menu")],
  [Keyboard.button.callback("💰 Кассовое расписание", "cash_schedule_menu")]
]);

// ---------- Команда /start ----------
bot.command("start", async (ctx) => {
  const message = await ctx.reply("Главное меню:", {
    attachments: [mainKeyboard]
  });

  // Сохраняем ID первого сообщения
  const userId = ctx.message?.sender?.user_id;
  if (userId && message?.body?.mid) {
    lastBotMessages.set(userId, message.body.mid);
  }
});

// ---------- Обработчики кнопок ----------
// Открытие подменю «Уборка»
bot.action("cleaning_menu", async (ctx) => {
  // Показываем меню сразу
  await replyAndDeletePrevious(ctx, "Уборка:", {
    attachments: [getCleaningKeyboard()]
  });

  // Запускаем предзагрузку кэша в фоне (не ждем завершения)
  preloadCache().catch(err => {
    console.error('Ошибка фоновой предзагрузки:', err.message);
  });
});

// Сегодня
bot.action("today", async (ctx) => {
  try {
    const dateStr = formatDateISO(new Date());
    const result = await getBookings(dateStr, true); // true = со статусами

    // Создаем клавиатуру: кнопки статусов + сброс + навигация
    const keyboard = Keyboard.inlineKeyboard([
      ...result.statusButtons,
      [Keyboard.button.callback("🔄 Сбросить прогресс", "reset_progress")],
      [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
    ]);

    await replyAndDeletePrevious(ctx, result.text, {
      attachments: [keyboard]
    });
  } catch (error) {
    console.error("❌ Ошибка в обработчике 'today':", error.message);
    await replyAndDeletePrevious(ctx, `❌ Ошибка загрузки данных:\n${error.message}\n\nПопробуйте позже или обратитесь к администратору.`, {
      attachments: [Keyboard.inlineKeyboard([
        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
      ])]
    });
  }
});

// Завтра
bot.action("tomorrow", async (ctx) => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const dateStr = formatDateISO(date);

  const result = await getBookings(dateStr, false); // false = без статусов

  // Создаем клавиатуру: только навигация
  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
  ]);

  await replyAndDeletePrevious(ctx, result.text, {
    attachments: [keyboard]
  });
});

// Проживающие сегодня
bot.action("residents_today", async (ctx) => {
  const dateStr = formatDateISO(new Date());
  const text = await getResidents(dateStr);

  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
  ]);

  await replyAndDeletePrevious(ctx, text, {
    attachments: [keyboard]
  });
});

// Статистика на неделю
bot.action("week_stats", async (ctx) => {
  const text = await getWeekStats();

  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
  ]);

  await replyAndDeletePrevious(ctx, text, {
    attachments: [keyboard]
  });
});

// Календарь - показ недели
bot.action(/calendar:(-?\d+)/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1], 10);

  await replyAndDeletePrevious(ctx, "Выберите дату:", {
    attachments: [getWeekKeyboard(weekOffset)]
  });
});

// Выбор конкретной даты из календаря
bot.action(/date:(.+)/, async (ctx) => {
  try {
    const dateStr = ctx.match[1];
    const today = formatDateISO(new Date());

    // Показываем статусы только для сегодняшней даты
    const showStatuses = dateStr === today;
    const result = await getBookings(dateStr, showStatuses);

    // Создаем клавиатуру
    let keyboard;
    if (showStatuses) {
      // Для сегодня: кнопки статусов + сброс + назад
      keyboard = Keyboard.inlineKeyboard([
        ...result.statusButtons,
        [Keyboard.button.callback("🔄 Сбросить прогресс", "reset_progress")],
        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
      ]);
    } else {
      // Для других дат: только назад
      keyboard = Keyboard.inlineKeyboard([
        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
      ]);
    }

    await replyAndDeletePrevious(ctx, result.text, {
      attachments: [keyboard]
    });
  } catch (error) {
    console.error("❌ Ошибка в обработчике 'date':", error.message);
    await replyAndDeletePrevious(ctx, `❌ Ошибка загрузки данных:\n${error.message}\n\nПопробуйте позже или обратитесь к администратору.`, {
      attachments: [Keyboard.inlineKeyboard([
        [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
      ])]
    });
  }
});

// Изменение статуса уборки номера
bot.action(/status:(.+):(.+):(not_started|in_progress|done)/, async (ctx) => {
  const dateStr = ctx.match[1];
  const roomName = ctx.match[2];
  const newStatus = ctx.match[3];

  // Сохраняем новый статус
  await setRoomStatus(dateStr, roomName, newStatus);

  // Обновляем отображение
  const result = await getBookings(dateStr, true); // true = со статусами

  const keyboard = Keyboard.inlineKeyboard([
    ...result.statusButtons,
    [Keyboard.button.callback("🔄 Сбросить прогресс", "reset_progress")],
    [Keyboard.button.callback("⬅ Назад в меню", "cleaning_menu")]
  ]);

  await replyAndDeletePrevious(ctx, result.text, {
    attachments: [keyboard]
  });
});

// Сброс всех статусов
bot.action("reset_progress", async (ctx) => {
  await resetAllStatuses();
  clearAllCache(); // Очищаем кэш

  await replyAndDeletePrevious(ctx, "✅ Весь прогресс сброшен!\n\nВыберите действие:", {
    attachments: [getCleaningKeyboard()]
  });
});

// Назад в главное меню
bot.action("back", async (ctx) => {
  await replyAndDeletePrevious(ctx, "Главное меню:", {
    attachments: [mainKeyboard]
  });
});

// ---------- Обработчики кассового расписания ----------
// Меню кассового расписания
bot.action("cash_schedule_menu", async (ctx) => {
  const today = new Date();
  const currentMonth = today.toLocaleString('ru-RU', { month: 'long' });
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).toLocaleString('ru-RU', { month: 'long' });

  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback(`Текущий месяц (${currentMonth})`, "cash_month:0")],
    [Keyboard.button.callback(`Следующий месяц (${nextMonth})`, "cash_month:1")],
    [Keyboard.button.callback("⬅ Назад", "back")]
  ]);

  await replyAndDeletePrevious(ctx, "💰 Кассовое расписание\n\nВыберите месяц:", {
    attachments: [keyboard]
  });
});

// Показ расписания за месяц
bot.action(/cash_month:(-?\d+)/, async (ctx) => {
  try {
    const monthOffset = parseInt(ctx.match[1], 10);

    const result = await getCashSchedule(monthOffset);

    // Создаем клавиатуру: кнопки статусов + назад
    const keyboard = Keyboard.inlineKeyboard([
      ...result.statusButtons,
      [Keyboard.button.callback("⬅ Назад к выбору месяца", "cash_schedule_menu")]
    ]);

    await replyAndDeletePrevious(ctx, result.text, {
      attachments: [keyboard]
    });
  } catch (error) {
    console.error("❌ Ошибка в обработчике 'cash_month':", error.message);
    await replyAndDeletePrevious(ctx, `❌ Ошибка загрузки данных:\n${error.message}\n\nПопробуйте позже или обратитесь к администратору.`, {
      attachments: [Keyboard.inlineKeyboard([
        [Keyboard.button.callback("⬅ Назад", "cash_schedule_menu")]
      ])]
    });
  }
});

// Изменение статуса платежа
bot.action(/pay:(.+):(.+):(pending|received)/, async (ctx) => {
  try {
    const monthKey = ctx.match[1];
    const date = ctx.match[2];
    const newStatus = ctx.match[3];

    // Сохраняем новый статус
    await setPaymentStatus(monthKey, date, newStatus);

    // Определяем monthOffset из monthKey
    const [year, month] = monthKey.split('-').map(Number);
    const today = new Date();
    const targetMonth = new Date(year, month - 1, 1);
    const monthOffset = (targetMonth.getFullYear() - today.getFullYear()) * 12 + (targetMonth.getMonth() - today.getMonth());

    // Обновляем отображение
    const result = await getCashSchedule(monthOffset);

    const keyboard = Keyboard.inlineKeyboard([
      ...result.statusButtons,
      [Keyboard.button.callback("⬅ Назад к выбору месяца", "cash_schedule_menu")]
    ]);

    await replyAndDeletePrevious(ctx, result.text, {
      attachments: [keyboard]
    });
  } catch (error) {
    console.error("❌ Ошибка в обработчике 'pay':", error.message);
    await replyAndDeletePrevious(ctx, `❌ Ошибка:\n${error.message}`, {
      attachments: [Keyboard.inlineKeyboard([
        [Keyboard.button.callback("⬅ Назад", "cash_schedule_menu")]
      ])]
    });
  }
});

// ---------- Запуск ----------

bot.start();