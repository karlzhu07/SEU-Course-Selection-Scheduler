// ==UserScript==
// @name         东南大学选课预排助手
// @namespace    https://github.com/local/seu-course-planner
// @version      0.1.6
// @description  在东南大学选课页显示预选课程周课表，并在本机检测时间冲突。
// @match        *://newxk.urp.seu.edu.cn/xsxk/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const TOTAL_WEEKS = 16;
  const ROW_HEIGHT = 64;
  const PANEL_WIDTH = 480;
  const HISTORY_LIMIT = 20;

  const DAYS = [
    { value: 1, label: '周一' },
    { value: 2, label: '周二' },
    { value: 3, label: '周三' },
    { value: 4, label: '周四' },
    { value: 5, label: '周五' },
    { value: 6, label: '周六' },
    { value: 7, label: '周日' },
  ];

  const TIME_TABLE = Object.freeze([
    { period: 1, start: '08:00', end: '08:45' },
    { period: 2, start: '08:50', end: '09:35' },
    { period: 3, start: '09:50', end: '10:35' },
    { period: 4, start: '10:40', end: '11:25' },
    { period: 5, start: '11:30', end: '12:15' },
    { period: 6, start: '14:00', end: '14:45' },
    { period: 7, start: '14:50', end: '15:35' },
    { period: 8, start: '15:50', end: '16:35' },
    { period: 9, start: '16:40', end: '17:25' },
    { period: 10, start: '17:30', end: '18:15' },
    { period: 11, start: '19:00', end: '19:45' },
    { period: 12, start: '19:50', end: '20:35' },
    { period: 13, start: '20:40', end: '21:25' },
  ]);

  const COURSE_NAME_ALIASES = [
    'KCMC',
    'COURSE_NAME',
    'COURSENAME',
    'courseName',
    'course_name',
    'kcmc',
    'name',
  ];
  const COURSE_CODE_ALIASES = [
    'KCH',
    'KCH_ID',
    'COURSE_CODE',
    'COURSECODE',
    'courseCode',
    'course_code',
    'kch',
    'kchId',
    'courseId',
  ];
  const CLASS_ID_ALIASES = [
    'JXBID',
    'JXB_ID',
    'TEACHING_CLASS_ID',
    'CLASS_ID',
    'classId',
    'class_id',
    'jxbid',
    'jxbId',
  ];
  const CLASS_NAME_ALIASES = [
    'JXBMC',
    'JXB_MC',
    'TEACHING_CLASS_NAME',
    'CLASS_NAME',
    'className',
    'class_name',
    'jxbmc',
    'jxbMc',
  ];
  const TEACHER_ALIASES = [
    'SKJS',
    'SKJSXM',
    'JSXM',
    'TEACHER',
    'TEACHER_NAME',
    'teacher',
    'teacherName',
    'skjs',
    'jsxm',
  ];
  const ROOM_ALIASES = [
    'JASMC',
    'JAS',
    'SKDD',
    'CLASSROOM',
    'ROOM',
    'LOCATION',
    'classroom',
    'room',
    'location',
    'jasmc',
    'skdd',
  ];
  const CREDIT_ALIASES = [
    'XF',
    'CREDIT',
    'CREDITS',
    'credit',
    'credits',
    'xf',
  ];
  const TYPE_ALIASES = [
    'KCXZ',
    'KCLB',
    'KCXX',
    'COURSE_TYPE',
    'COURSE_CATEGORY',
    'TYPE_NAME',
    'courseType',
    'courseCategory',
    'typeName',
    'kcxz',
    'kclb',
  ];
  const WEEKS_ALIASES = [
    'SKZC',
    'ZC',
    'WEEKS',
    'WEEK_RANGE',
    'weeks',
    'weekRange',
    'zc',
    'skzc',
  ];
  const DAY_ALIASES = [
    'SKXQ',
    'XQ',
    'WEEKDAY',
    'WEEK_DAY',
    'DAY',
    'day',
    'weekDay',
    'xq',
    'skxq',
  ];
  const PERIOD_ALIASES = [
    'SKJC',
    'JCS',
    'JC',
    'PERIOD',
    'PERIODS',
    'SECTION',
    'SECTIONS',
    'period',
    'periods',
    'section',
    'sections',
    'jc',
    'skjc',
  ];
  const TIME_TEXT_ALIASES = [
    'SKSJ',
    'SKTIME',
    'SK_TIME',
    'CLASS_TIME',
    'CLASSTIME',
    'COURSE_TIME',
    'time',
    'classTime',
    'skTime',
    'sksj',
  ];
  const SELECTED_ALIASES = [
    'SFYX',
    'SELECTED',
    'IS_SELECTED',
    'ISSELECTED',
    'selected',
    'isSelected',
    'sfyx',
  ];

  const CARD_SELECTOR = [
    '.el-card',
    'tr',
    'li',
    '[class*="course"]',
    '[class*="Course"]',
    '[class*="kcmc"]',
    '[class*="KCMC"]',
    '[class*="jxbmc"]',
    '[class*="JXBMC"]',
    '[class*="clazz"]',
    '[class*="Clazz"]',
  ].join(',');

  function range(start, end) {
    const output = [];
    for (let value = start; value <= end; value += 1) output.push(value);
    return output;
  }

  function normalizeText(value) {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t\r\f\v]+/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  function stringValue(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join('; ');
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return normalizeText(value);
  }

  function firstValue(object, aliases) {
    if (!object || typeof object !== 'object') return undefined;
    const keyMap = new Map();
    Object.keys(object).forEach((key) => keyMap.set(key.toLowerCase(), key));
    for (const alias of aliases) {
      const key = keyMap.get(alias.toLowerCase());
      if (!key) continue;
      const value = object[key];
      if (value == null || value === '') continue;
      return value;
    }
    return undefined;
  }

  function toInteger(value, fallback = null) {
    const match = String(value ?? '').match(/\d+/);
    if (!match) return fallback;
    const parsed = Number.parseInt(match[0], 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampPeriod(value, fallback) {
    const parsed = toInteger(value, fallback);
    if (parsed == null) return fallback;
    return Math.min(13, Math.max(1, parsed));
  }

  function parseWeekList(value, totalWeeks = TOTAL_WEEKS) {
    const text = normalizeText(value);
    if (!text) {
      return {
        weeks: range(1, totalWeeks),
        known: false,
        text: '',
      };
    }

    const weeks = new Set();
    const rangePattern = /(\d{1,2})\s*(?:-|~|—|－|至)\s*(\d{1,2})/g;
    let match;
    while ((match = rangePattern.exec(text)) !== null) {
      const start = Math.max(1, Number.parseInt(match[1], 10));
      const end = Math.min(totalWeeks, Number.parseInt(match[2], 10));
      for (let week = start; week <= end; week += 1) weeks.add(week);
    }

    if (weeks.size === 0) {
      const numberPattern = /(?:第\s*)?(\d{1,2})\s*周/g;
      while ((match = numberPattern.exec(text)) !== null) {
        const week = Number.parseInt(match[1], 10);
        if (week >= 1 && week <= totalWeeks) weeks.add(week);
      }
    }

    if (weeks.size === 0 && /^\d{1,2}$/.test(text)) {
      const week = Number.parseInt(text, 10);
      if (week >= 1 && week <= totalWeeks) weeks.add(week);
    }

    if (weeks.size === 0 && /(?:每周|全周|全学期)/.test(text)) {
      range(1, totalWeeks).forEach((week) => weeks.add(week));
    }

    if (weeks.size === 0) {
      return {
        weeks: range(1, totalWeeks),
        known: false,
        text,
      };
    }

    let result = [...weeks].sort((a, b) => a - b);
    const oddOnly = /单周|单\)|单）/.test(text);
    const evenOnly = /双周|双\)|双）/.test(text);
    if (oddOnly && !evenOnly) result = result.filter((week) => week % 2 === 1);
    if (evenOnly && !oddOnly) result = result.filter((week) => week % 2 === 0);

    return {
      weeks: result,
      known: true,
      text,
    };
  }

  function parseDay(value) {
    const text = normalizeText(value);
    const numeric = Number.parseInt(text, 10);
    if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 7) return numeric;
    const match = text.match(/(?:星期|周)\s*([一二三四五六日天])/);
    if (!match) return null;
    const map = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      日: 7,
      天: 7,
    };
    return map[match[1]] ?? null;
  }

  function parsePeriodRange(value) {
    if (value == null || value === '') return null;
    const text = normalizeText(value);
    const numeric = Number.parseInt(text, 10);
    if (/^\d{1,2}$/.test(text) && numeric >= 1 && numeric <= 13) {
      return { start: numeric, end: numeric };
    }

    let match = text.match(
      /(?:第\s*)?(\d{1,2})\s*(?:-|~|—|－|至)\s*(\d{1,2})\s*节?/,
    );
    if (!match) {
      match = text.match(/(\d{1,2})\s*[,、]\s*(\d{1,2})\s*节?/);
    }
    if (!match) {
      match = text.match(/(?:第\s*)?(\d{1,2})\s*节/);
    }
    if (!match) return null;

    const start = clampPeriod(match[1], 1);
    const end = clampPeriod(match[2] ?? match[1], start);
    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
    };
  }

  function parseMeetingsFromText(value, totalWeeks = TOTAL_WEEKS) {
    const text = normalizeText(value);
    if (!text) return [];

    const meetings = [];
    const segments = text
      .split(/[;；,|\n]+/)
      .map(normalizeText)
      .filter(Boolean);
    for (const segment of segments) {
      const dayMatches = [
        ...segment.matchAll(/(?:星期|周)\s*([一二三四五六日天])/g),
      ].map((match) => ({
        index: match.index,
        day: parseDay(match[0]),
      }));
      if (dayMatches.length === 0) continue;

      const ranges = [];
      const rangePattern =
        /(?:第\s*)?(\d{1,2})\s*(?:-|~|—|－|至)\s*(\d{1,2})\s*节|(\d{1,2})\s*[,、]\s*(\d{1,2})\s*节|(?:第\s*)?(\d{1,2})\s*节/g;
      let rangeMatch;
      while ((rangeMatch = rangePattern.exec(segment)) !== null) {
        const parsed = parsePeriodRange(rangeMatch[0]);
        if (parsed) ranges.push({ ...parsed, index: rangeMatch.index });
      }
      if (ranges.length === 0) continue;

      const weekInfo = parseWeekList(segment, totalWeeks);
      const pairs = [];
      if (dayMatches.length === 1) {
        ranges.forEach((period) => pairs.push([dayMatches[0], period]));
      } else if (ranges.length === 1) {
        dayMatches.forEach((dayMatch) => pairs.push([dayMatch, ranges[0]]));
      } else if (dayMatches.length === ranges.length) {
        ranges.forEach((period, index) =>
          pairs.push([dayMatches[index], period]),
        );
      } else {
        ranges.forEach((period) => {
          const previousDay =
            [...dayMatches]
              .reverse()
              .find((dayMatch) => dayMatch.index < period.index) ||
            dayMatches[0];
          pairs.push([previousDay, period]);
        });
      }

      for (const [dayMatch, period] of pairs) {
        if (!dayMatch?.day) continue;
        meetings.push({
          day: dayMatch.day,
          startPeriod: period.start,
          endPeriod: period.end,
          weeks: weekInfo.weeks,
          weeksKnown: weekInfo.known,
          weeksText: weekInfo.text,
        });
      }
    }
    return dedupeMeetings(meetings);
  }

  function meetingFromFields(object, totalWeeks = TOTAL_WEEKS) {
    if (!object || typeof object !== 'object') return null;
    const day = parseDay(firstValue(object, DAY_ALIASES));
    const period = parsePeriodRange(firstValue(object, PERIOD_ALIASES));
    if (!day || !period) return null;
    const weekInfo = parseWeekList(firstValue(object, WEEKS_ALIASES), totalWeeks);
    return {
      day,
      startPeriod: period.start,
      endPeriod: period.end,
      weeks: weekInfo.weeks,
      weeksKnown: weekInfo.known,
      weeksText: weekInfo.text,
    };
  }

  function parseMeetingsFromValue(value, totalWeeks = TOTAL_WEEKS) {
    if (value == null || value === '') return [];
    if (Array.isArray(value)) {
      return dedupeMeetings(
        value.flatMap((item) => parseMeetingsFromValue(item, totalWeeks)),
      );
    }
    if (typeof value === 'object') {
      const direct = meetingFromFields(value, totalWeeks);
      if (direct) return [direct];
      const nested = firstValue(value, ['times', 'timeList', 'meetings', 'items']);
      return parseMeetingsFromValue(nested, totalWeeks);
    }

    const text = normalizeText(value);
    if (!text) return [];
    if (/^[\[{]/.test(text)) {
      try {
        return parseMeetingsFromValue(JSON.parse(text), totalWeeks);
      } catch {
        // Fall through to free-text parsing.
      }
    }
    return parseMeetingsFromText(text, totalWeeks);
  }

  function meetingSignature(meeting) {
    return [
      meeting.day,
      meeting.startPeriod,
      meeting.endPeriod,
      meeting.weeksText || meeting.weeks.join(','),
    ].join('|');
  }

  function dedupeMeetings(meetings) {
    const seen = new Set();
    const result = [];
    for (const meeting of meetings) {
      if (!meeting || !meeting.day || !meeting.startPeriod || !meeting.endPeriod) continue;
      const signature = meetingSignature(meeting);
      if (seen.has(signature)) continue;
      seen.add(signature);
      result.push(meeting);
    }
    return result.sort(
      (left, right) =>
        left.day - right.day ||
        left.startPeriod - right.startPeriod ||
        left.endPeriod - right.endPeriod,
    );
  }

  function mergeDisplayMeetings(meetings) {
    const sorted = dedupeMeetings(meetings);
    const groups = [];
    for (const meeting of sorted) {
      const group = groups.find(
        (candidate) =>
          candidate.day === meeting.day &&
          meeting.startPeriod <= candidate.endPeriod + 1,
      );
      if (group) {
        group.endPeriod = Math.max(group.endPeriod, meeting.endPeriod);
        group.meetings.push(meeting);
      } else {
        groups.push({
          day: meeting.day,
          startPeriod: meeting.startPeriod,
          endPeriod: meeting.endPeriod,
          meetings: [meeting],
        });
      }
    }

    return groups.map((group) => ({
      day: group.day,
      startPeriod: group.startPeriod,
      endPeriod: group.endPeriod,
      schedules: dedupeMeetings(group.meetings),
    }));
  }

  function isTruthySelected(value) {
    if (value === true) return true;
    if (value === false || value == null) return false;
    const text = normalizeText(value).toLowerCase();
    return ['1', 'true', 'yes', 'y', '是', '已选', '选中'].includes(text);
  }

  function looksLikeCourse(object) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
    const name = stringValue(firstValue(object, COURSE_NAME_ALIASES));
    if (!name) return false;
    return Boolean(
      firstValue(object, COURSE_CODE_ALIASES) ||
        firstValue(object, CLASS_ID_ALIASES) ||
        firstValue(object, TIME_TEXT_ALIASES) ||
        firstValue(object, PERIOD_ALIASES) ||
        firstValue(object, WEEKS_ALIASES),
    );
  }

  function normalizeCourse(object, options = {}) {
    if (!object || typeof object !== 'object') return null;
    const courseName = stringValue(firstValue(object, COURSE_NAME_ALIASES));
    if (!courseName) return null;

    const courseCode = stringValue(firstValue(object, COURSE_CODE_ALIASES));
    const classId = stringValue(firstValue(object, CLASS_ID_ALIASES));
    const className =
      stringValue(firstValue(object, CLASS_NAME_ALIASES)) || classId || '未命名教学班';
    const teacher = stringValue(firstValue(object, TEACHER_ALIASES));
    const room = stringValue(firstValue(object, ROOM_ALIASES));
    const credits = stringValue(firstValue(object, CREDIT_ALIASES));
    const type = stringValue(firstValue(object, TYPE_ALIASES));

    const meetings = [];
    const directMeeting = meetingFromFields(object, options.totalWeeks);
    if (directMeeting) meetings.push(directMeeting);

    for (const alias of TIME_TEXT_ALIASES) {
      const value = firstValue(object, [alias]);
      if (value == null || value === '') continue;
      meetings.push(...parseMeetingsFromValue(value, options.totalWeeks));
    }

    if (meetings.length === 0 && options.rawText) {
      meetings.push(
        ...parseMeetingsFromText(options.rawText, options.totalWeeks),
      );
    }

    const uniqueMeetings = dedupeMeetings(meetings);
    const warnings = [];
    if (uniqueMeetings.length === 0) warnings.push('未解析到上课时间');
    if (uniqueMeetings.some((meeting) => !meeting.weeksKnown)) {
      warnings.push('周次未标明');
    }

    const official =
      Boolean(options.officialHint) ||
      isTruthySelected(firstValue(object, SELECTED_ALIASES));

    const identityParts = [
      courseCode || courseName,
      classId || className,
      teacher || '',
    ];
    const id = identityParts.join('|');

    return {
      id,
      courseCode,
      courseName,
      classId,
      className,
      teacher,
      room,
      credits,
      type,
      meetings: uniqueMeetings,
      official,
      warnings,
      rawText: normalizeText(options.rawText),
      source: options.source || '',
      updatedAt: Date.now(),
    };
  }

  function extractCourses(payload, options = {}) {
    let source = payload;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch {
        return [];
      }
    }

    const courses = [];
    const identities = new Set();
    const seen = new WeakSet();
    const maxDepth = options.maxDepth ?? 8;
    const maxNodes = options.maxNodes ?? 8000;
    let visited = 0;

    function addCourse(course) {
      if (!course) return;
      if (identities.has(course.id)) return;
      identities.add(course.id);
      courses.push(course);
    }

    function walk(value, depth) {
      if (visited >= maxNodes || depth > maxDepth || value == null) return;
      if (typeof value !== 'object') return;
      if (seen.has(value)) return;
      seen.add(value);
      visited += 1;

      if (Array.isArray(value)) {
        for (const item of value.slice(0, maxNodes)) walk(item, depth + 1);
        return;
      }

      if (looksLikeCourse(value)) {
        addCourse(
          normalizeCourse(value, {
            ...options,
            source: options.source,
          }),
        );
        return;
      }

      for (const key of Object.keys(value)) {
        if (key === '__ob__' || key.startsWith('$') || key.startsWith('__')) continue;
        walk(value[key], depth + 1);
      }
    }

    walk(source, 0);
    return courses;
  }

  function intersects(left, right) {
    const rightSet = new Set(right);
    return left.some((value) => rightSet.has(value));
  }

  function meetingAppliesToWeek(meeting, mode = 'all') {
    if (!meeting) return false;
    if (mode === 'all') return true;
    if (!meeting.weeksKnown) return true;
    if (mode === 'odd') return meeting.weeks.some((week) => week % 2 === 1);
    if (mode === 'even') return meeting.weeks.some((week) => week % 2 === 0);
    const week = Number.parseInt(mode, 10);
    return Number.isFinite(week) ? meeting.weeks.includes(week) : true;
  }

  function meetingsConflict(left, right, mode = 'all') {
    if (!left || !right) return false;
    if (left.day !== right.day) return false;
    if (left.startPeriod > right.endPeriod || right.startPeriod > left.endPeriod) {
      return false;
    }

    if (!meetingAppliesToWeek(left, mode) || !meetingAppliesToWeek(right, mode)) {
      return false;
    }
    if (!left.weeksKnown || !right.weeksKnown) return true;

    if (mode === 'all') return intersects(left.weeks, right.weeks);
    if (mode === 'odd') {
      return intersects(
        left.weeks.filter((week) => week % 2 === 1),
        right.weeks.filter((week) => week % 2 === 1),
      );
    }
    if (mode === 'even') {
      return intersects(
        left.weeks.filter((week) => week % 2 === 0),
        right.weeks.filter((week) => week % 2 === 0),
      );
    }
    const week = Number.parseInt(mode, 10);
    return (
      Number.isFinite(week) &&
      left.weeks.includes(week) &&
      right.weeks.includes(week)
    );
  }

  function coursesConflict(left, right, mode = 'all') {
    if (!left || !right || left.id === right.id) return false;
    return left.meetings.some((leftMeeting) =>
      right.meetings.some((rightMeeting) =>
        meetingsConflict(leftMeeting, rightMeeting, mode),
      ),
    );
  }

  function detectConflictIds(courses, mode = 'all') {
    const ids = new Set();
    for (let leftIndex = 0; leftIndex < courses.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < courses.length;
        rightIndex += 1
      ) {
        if (coursesConflict(courses[leftIndex], courses[rightIndex], mode)) {
          ids.add(courses[leftIndex].id);
          ids.add(courses[rightIndex].id);
        }
      }
    }
    return ids;
  }

  const Core = {
    DAYS,
    TIME_TABLE,
    TOTAL_WEEKS,
    parseWeekList,
    parseDay,
    parsePeriodRange,
    parseMeetingsFromText,
    parseMeetingsFromValue,
    normalizeCourse,
    extractCourses,
    meetingAppliesToWeek,
    meetingsConflict,
    coursesConflict,
    detectConflictIds,
    dedupeMeetings,
    mergeDisplayMeetings,
    normalizeText,
    stringValue,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Core;
    return;
  }

  startApp(Core);

  function startApp(core) {
    let context = null;
    let storageKey = '';
    let state = null;
    let host = null;
    let shadow = null;
    let renderQueued = false;
    let scanTimer = null;
    let mutationTimer = null;
    let toastTimer = null;
    let catalogQuery = '';
    let injectedPointerHooked = false;
    let lastInjectedAction = { id: '', at: 0 };
    const injectedCourseByButton = new WeakMap();
    const pendingBatches = [];

    function resolveContext() {
      const batch = window.batch && typeof window.batch === 'object' ? window.batch : {};
      const url = new URL(window.location.href);
      const batchCode =
        core.stringValue(batch.code) ||
        url.searchParams.get('batchId') ||
        'default';
      const schoolTerm =
        core.stringValue(batch.schoolTerm) ||
        url.searchParams.get('schoolTerm') ||
        'default';
      const key = `seu-course-planner:v1:${schoolTerm}:${batchCode}`;
      return { batchCode, schoolTerm, key };
    }

    function defaultState() {
      return {
        version: 1,
        planned: [],
        official: [],
        catalog: [],
        history: [],
        weekMode: 'all',
        collapsed: false,
        panelPosition: null,
        updatedAt: Date.now(),
      };
    }

    function loadState() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (!parsed || typeof parsed !== 'object') return defaultState();
        return {
          ...defaultState(),
          ...parsed,
          planned: Array.isArray(parsed.planned) ? parsed.planned : [],
          official: Array.isArray(parsed.official) ? parsed.official : [],
          catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
          history: Array.isArray(parsed.history) ? parsed.history : [],
          panelPosition:
            parsed.panelPosition &&
            Number.isFinite(parsed.panelPosition.x) &&
            Number.isFinite(parsed.panelPosition.y)
              ? {
                  x: parsed.panelPosition.x,
                  y: parsed.panelPosition.y,
                }
              : null,
        };
      } catch {
        return defaultState();
      }
    }

    function saveState() {
      if (!state) return;
      state.updatedAt = Date.now();
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {
        console.warn('[SEU Course Planner] Failed to save state.', error);
      }
    }

    function ensureContext() {
      const nextContext = resolveContext();
      if (context && nextContext.key === context.key) return false;
      context = nextContext;
      storageKey = nextContext.key;
      state = loadState();
      scheduleRender();
      return true;
    }

    function deepClone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function pushHistory() {
      if (!state) return;
      state.history.push(deepClone(state.planned));
      if (state.history.length > HISTORY_LIMIT) {
        state.history.splice(0, state.history.length - HISTORY_LIMIT);
      }
    }

    function mergeCourse(existing, incoming) {
      if (!existing) return incoming;
      const changed =
        existing.courseName !== incoming.courseName ||
        existing.className !== incoming.className ||
        existing.teacher !== incoming.teacher ||
        existing.room !== incoming.room ||
        JSON.stringify(existing.meetings) !== JSON.stringify(incoming.meetings);
      return {
        ...existing,
        ...incoming,
        official: Boolean(existing.official || incoming.official),
        meetings:
          incoming.meetings && incoming.meetings.length > 0
            ? incoming.meetings
            : existing.meetings || [],
        changed: Boolean(existing.changed || changed),
        updatedAt: Date.now(),
      };
    }

    function mergeCourseList(existingList, incomingList) {
      const map = new Map();
      existingList.forEach((course) => map.set(course.id, course));
      incomingList.forEach((course) => {
        const merged = mergeCourse(map.get(course.id), course);
        map.set(course.id, merged);
      });
      return [...map.values()];
    }

    function courseSignature(course) {
      return JSON.stringify([
        course.id,
        course.courseCode,
        course.courseName,
        course.classId,
        course.className,
        course.teacher,
        course.room,
        course.credits,
        course.type,
        Boolean(course.official),
        course.meetings,
        course.warnings,
        Boolean(course.stale),
      ]);
    }

    function courseListSignature(courses) {
      return courses.map(courseSignature).sort().join('\n');
    }

    function ingestCourses(courses, source) {
      if (!state || !courses || courses.length === 0) return;
      const catalog = [];
      const official = [];
      for (const course of courses) {
        const normalized = {
          ...course,
          source: source || course.source || '',
          updatedAt: Date.now(),
        };
        catalog.push(normalized);
        if (normalized.official) official.push({ ...normalized, official: true });
      }

      const nextCatalog = mergeCourseList(state.catalog, catalog).slice(-1200);
      let changed =
        courseListSignature(nextCatalog) !== courseListSignature(state.catalog);
      state.catalog = nextCatalog;

      let nextOfficial = state.official;
      if (official.length > 0) {
        nextOfficial = mergeCourseList(state.official, official).slice(-600);
        if (courseListSignature(nextOfficial) !== courseListSignature(state.official)) {
          changed = true;
        }
      }

      if (changed) {
        const catalogById = new Map(
          nextCatalog.map((course) => [course.id, course]),
        );
        const latestFor = (course) =>
          catalogById.get(course.id) ||
          nextCatalog.find(
            (candidate) =>
              course.classId &&
              candidate.classId === course.classId &&
              candidate.courseCode === course.courseCode,
          ) ||
          nextCatalog.find(
            (candidate) =>
              course.className &&
              candidate.className === course.className &&
              candidate.courseCode === course.courseCode,
          ) ||
          nextCatalog.find(
            (candidate) =>
              course.courseCode && candidate.courseCode === course.courseCode,
          );
        state.planned = state.planned.map((course) => {
          const latest = latestFor(course);
          return latest
            ? {
                ...course,
                courseName: latest.courseName,
                className: latest.className,
                teacher: latest.teacher,
                room: latest.room,
                credits: latest.credits,
                type: latest.type,
                meetings: latest.meetings,
                warnings: latest.warnings,
                stale: false,
              }
            : course;
        });
        state.official = nextOfficial.map((course) => {
          const latest = latestFor(course);
          return latest
            ? {
                ...course,
                courseName: latest.courseName,
                className: latest.className,
                teacher: latest.teacher,
                room: latest.room,
                credits: latest.credits,
                type: latest.type,
                meetings: latest.meetings,
                warnings: latest.warnings,
                stale: false,
              }
            : course;
        });
        saveState();
        scheduleRender();
      }
      scheduleDomScan();
    }

    function queueCourses(courses, source) {
      if (!courses || courses.length === 0) return;
      if (!state) {
        pendingBatches.push({ courses, source });
        return;
      }
      ingestCourses(courses, source);
    }

    function flushPendingCourses() {
      const batches = pendingBatches.splice(0, pendingBatches.length);
      batches.forEach(({ courses, source }) => ingestCourses(courses, source));
    }

    function parsePayload(payload, source) {
      const officialHint = /(selected|mycourse|my-course|yxk|result)/i.test(source);
      const courses = core.extractCourses(payload, {
        source,
        officialHint,
      });
      queueCourses(courses, source);
    }

    function maybeParseResponseText(text, source) {
      if (
        !text ||
        text.length < 20 ||
        text.length > 5_000_000 ||
        !/[\{\[]/.test(text)
      ) {
        return;
      }
      try {
        parsePayload(JSON.parse(text), source);
      } catch {
        // Not JSON; ignore.
      }
    }

    function installNetworkHooks() {
      if (window.__SEU_COURSE_PLANNER_NETWORK_HOOKED__) return;
      window.__SEU_COURSE_PLANNER_NETWORK_HOOKED__ = true;

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
        this.__seuPlannerUrl = String(url || '');
        return originalOpen.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function send(...args) {
        this.addEventListener('load', () => {
          const url = this.responseURL || this.__seuPlannerUrl || '';
          try {
            if (this.responseType === 'json') {
              parsePayload(this.response, url);
              return;
            }
            if (this.responseType === '' || this.responseType === 'text') {
              maybeParseResponseText(this.responseText, url);
            }
          } catch {
            // A protected or unavailable response should not affect the site.
          }
        });
        return originalSend.apply(this, args);
      };

      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function') {
        window.fetch = function fetch(input, init) {
          const source =
            typeof input === 'string'
              ? input
              : input && typeof input.url === 'string'
                ? input.url
                : '';
          return originalFetch.call(this, input, init).then((response) => {
            response
              .clone()
              .text()
              .then((text) => maybeParseResponseText(text, source))
              .catch(() => {});
            return response;
          });
        };
      }
    }

    function scanVueData() {
      const app = document.getElementById('xsxkapp');
      if (!app || !app.__vue__) return;
      const vm = app.__vue__;
      const candidates = [];

      const directKeys = [
        '$data',
        'courseList',
        'courseData',
        'clazzList',
        'classList',
        'selectedCourses',
        'selectedList',
        'resultList',
      ];
      directKeys.forEach((key) => {
        if (vm[key] != null) candidates.push(vm[key]);
      });

      const courses = candidates.flatMap((candidate) =>
        core.extractCourses(candidate, {
          source: 'vue',
          maxDepth: 6,
          maxNodes: 6000,
        }),
      );
      if (courses.length > 0) queueCourses(courses, 'vue');
    }

    function elementText(element) {
      return core
        .normalizeText(element.innerText || element.textContent || '')
        .replace(/\s+/g, ' ');
    }

    function findCatalogCourseByText(text) {
      const normalized = core.normalizeText(text);
      if (!normalized) return null;
      let best = null;
      for (const course of state.catalog) {
        const code = course.courseCode && normalized.includes(course.courseCode);
        const name =
          course.courseName &&
          course.courseName.length >= 2 &&
          normalized.includes(course.courseName);
        if (!code && !name) continue;
        if (!best || course.courseName.length > best.courseName.length) best = course;
      }
      return best;
    }

    function guessCourseName(text) {
      const lines = String(text)
        .split(/[\n|；;]+/)
        .map(core.normalizeText)
        .filter(Boolean);
      for (const line of lines) {
        if (line.length < 2 || line.length > 50) continue;
        if (/星期|周[一二三四五六日天]|第?\d+\s*节|学分|教师|教室|教学班/.test(line)) {
          continue;
        }
        return line;
      }
      return '';
    }

    function courseFromElement(element) {
      const rawText = String(element.innerText || element.textContent || '')
        .replace(/\u00a0/g, ' ')
        .trim();
      const text = elementText(element);
      if (!text) return null;
      const catalogCourse = findCatalogCourseByText(text);
      if (catalogCourse) {
        return {
          ...catalogCourse,
          rawText: text,
          source: `${catalogCourse.source || 'page'}+dom`,
        };
      }
      const courseName = guessCourseName(rawText);
      if (!courseName) return null;
      return core.normalizeCourse(
        {
          courseName,
          rawText: text,
        },
        { rawText: text, source: 'dom' },
      );
    }

    function isVisible(element) {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 20) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function findChoiceButton(root) {
      if (!root?.querySelectorAll) return null;
      const candidates = root.querySelectorAll(
        'button, a, .el-button, [role="button"]',
      );
      return (
        [...candidates].find((candidate) => {
          if (candidate.classList.contains('seu-planner-add')) return false;
          const text = elementText(candidate).replace(/\s+/g, '');
          return ['选择', '选课', '添加', '选择课程', '选择教学班'].includes(
            text,
          );
        }) || null
      );
    }

    function findCourseContainerNearChoice(choiceButton) {
      let current = choiceButton?.parentElement || null;
      let fallback = null;
      let depth = 0;
      while (
        current &&
        current !== document.body &&
        current !== document.documentElement &&
        depth < 7
      ) {
        const text = elementText(current);
        if (text.length >= 12 && text.length <= 1200) {
          fallback = fallback || current;
          if (
            /星期[一二三四五六日天]|周[一二三四五六日天]|第?\s*\d{1,2}\s*(?:-|~|至)\s*\d{1,2}\s*节/.test(
              text,
            ) ||
            findCatalogCourseByText(text)
          ) {
            return current;
          }
        }
        current = current.parentElement;
        depth += 1;
      }
      return fallback;
    }

    function createPlannerButton(course, compact = false) {
      const selected = findOfficialByCourse(course);
      const planned = findPlannedByCourse(course);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seu-planner-add';
      button.dataset.courseId = encodeURIComponent(course.id);
      button.dataset.seuGreen = '1';

      if (selected) {
        button.textContent = '已选';
        button.disabled = true;
      } else if (planned) {
        button.textContent = '已预选';
        button.disabled = true;
      } else {
        button.textContent = '+ 预选';
      }

      Object.assign(button.style, {
        margin: compact ? '0 6px 0 0' : '6px 0 6px 8px',
        padding: compact ? '5px 12px' : '5px 11px',
        border: `1px solid ${selected || planned ? '#86efac' : '#15803d'}`,
        borderRadius: '6px',
        background: selected || planned ? '#dcfce7' : '#16a34a',
        color: selected || planned ? '#166534' : '#fff',
        cursor: selected || planned ? 'default' : 'pointer',
        fontSize: '12px',
        fontWeight: '700',
        lineHeight: '18px',
        opacity: selected || planned ? '0.82' : '1',
        pointerEvents: 'auto',
        position: 'relative',
        verticalAlign: 'middle',
        touchAction: 'manipulation',
        zIndex: '2147483645',
        boxShadow:
          selected || planned
            ? 'none'
            : '0 2px 10px rgba(22, 163, 74, 0.32)',
      });

      injectedCourseByButton.set(button, course);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!selected && !planned) addCourse(course);
      });
      return button;
    }

    function placePlannerButton(container, choiceButton = null) {
      if (
        !container ||
        container.closest('.seu-course-planner-host') ||
        container.querySelector('.seu-planner-add')
      ) {
        return false;
      }
      const course = courseFromElement(container);
      if (!course) return false;
      if (course.meetings.length === 0 && course.rawText.length < 20) return false;

      const button = createPlannerButton(course, Boolean(choiceButton));
      if (choiceButton?.parentElement) {
        choiceButton.parentElement.insertBefore(button, choiceButton);
      } else {
        const target =
          container.tagName === 'TR'
            ? container.lastElementChild || container
            : container;
        target.appendChild(button);
      }
      return true;
    }

    function injectBesideChoiceButtons() {
      const choiceButtons = [
        ...document.querySelectorAll('button, a, .el-button, [role="button"]'),
      ].filter((button) => {
        if (button.classList.contains('seu-planner-add')) return false;
        if (button.closest('.seu-course-planner-host')) return false;
        const text = elementText(button).replace(/\s+/g, '');
        return ['选择', '选课', '添加', '选择课程', '选择教学班'].includes(text);
      });

      const handled = new Set();
      choiceButtons.forEach((choiceButton) => {
        const container = findCourseContainerNearChoice(choiceButton);
        if (!container || handled.has(container)) return;
        handled.add(container);
        placePlannerButton(container, choiceButton);
      });
    }

    function injectCourseButtons() {
      if (!state || !document.body) return;
      const candidates = [...document.querySelectorAll(CARD_SELECTOR)]
        .filter(isVisible)
        .slice(0, 1200);

      const usable = [];
      for (const element of candidates) {
        if (element.closest('.seu-course-planner-host')) continue;
        const text = elementText(element);
        if (text.length < 12 || text.length > 900) continue;
        const hasTime =
          /星期[一二三四五六日天]|周[一二三四五六日天]|第?\s*\d{1,2}\s*(?:-|~|至)\s*\d{1,2}\s*节/.test(
            text,
          );
        if (!hasTime && !findCatalogCourseByText(text)) continue;
        usable.push(element);
      }

      const deepest = usable.filter(
        (element) =>
          !usable.some(
            (other) =>
              other !== element &&
              element.contains(other) &&
              other.matches('.el-card, tr, li, [class*="item"], [class*="card"]'),
          ),
      );

      deepest.forEach((element) => {
        placePlannerButton(element, findChoiceButton(element));
      });

      injectBesideChoiceButtons();
      installInjectedPointerHandler();
    }

    function buttonAtPoint(clientX, clientY) {
      const buttons = document.querySelectorAll('.seu-planner-add:not([disabled])');
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return button;
        }
      }
      return null;
    }

    function activateInjectedButton(button) {
      const course = injectedCourseByButton.get(button);
      if (!course) return;
      const now = Date.now();
      if (
        lastInjectedAction.id === course.id &&
        now - lastInjectedAction.at < 500
      ) {
        return;
      }
      lastInjectedAction = { id: course.id, at: now };
      addCourse(course);
    }

    function installInjectedPointerHandler() {
      if (injectedPointerHooked) return;
      injectedPointerHooked = true;
      window.addEventListener(
        'pointerdown',
        (event) => {
          if (event.button !== 0 && event.pointerType === 'mouse') return;
          const directTarget =
            event.target instanceof Element
              ? event.target.closest('.seu-planner-add')
              : null;
          const button =
            directTarget || buttonAtPoint(event.clientX, event.clientY);
          if (!button || button.disabled) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          activateInjectedButton(button);
        },
        true,
      );
    }

    function scheduleDomScan() {
      if (mutationTimer) window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => {
        injectCourseButtons();
      }, 250);
    }

    function resolveCourseId(encodedId) {
      try {
        return decodeURIComponent(encodedId || '');
      } catch {
        return encodedId || '';
      }
    }

    function findOfficialByCourse(course) {
      if (!state || !course) return null;
      return (
        state.official.find(
          (item) =>
            item.id === course.id ||
            (course.courseCode && item.courseCode === course.courseCode),
        ) || null
      );
    }

    function findPlannedByCourse(course) {
      if (!state || !course) return null;
      return (
        state.planned.find(
          (item) =>
            item.id === course.id ||
            (course.courseCode && item.courseCode === course.courseCode),
        ) || null
      );
    }

    function activeCourses() {
      if (!state) return [];
      const officialCodes = new Set(
        state.official
          .map((course) => course.courseCode)
          .filter(Boolean),
      );
      const planned = state.planned.filter(
        (course) => !course.courseCode || !officialCodes.has(course.courseCode),
      );
      return [...state.official, ...planned];
    }

    function findConflicts(course, forceId = '') {
      return activeCourses().filter((existing) => {
        if (forceId && existing.id === forceId) return false;
        if (
          course.courseCode &&
          existing.courseCode &&
          course.courseCode === existing.courseCode
        ) {
          return false;
        }
        return core.coursesConflict(course, existing, state.weekMode);
      });
    }

    function addCourse(course, force = false) {
      if (!state || !course) return;
      if (findOfficialByCourse(course)) {
        showToast('这门课已经在正式已选课程中。');
        return;
      }

      const samePlanned = findPlannedByCourse(course);
      if (samePlanned && samePlanned.id === course.id) {
        showToast('这门教学班已经在预选课表中。');
        return;
      }

      const conflicts = findConflicts(course);
      if (conflicts.length > 0 && !force) {
        const names = conflicts.map((item) => item.courseName).join('、');
        const accepted = window.confirm(
          `与已选或预选课程冲突：${names}\n\n仍要强制加入吗？`,
        );
        if (!accepted) return;
      }

      pushHistory();
      if (course.courseCode) {
        state.planned = state.planned.filter(
          (item) => item.courseCode !== course.courseCode,
        );
      } else {
        state.planned = state.planned.filter((item) => item.id !== course.id);
      }
      state.planned.push({
        ...deepClone(course),
        official: false,
        addedAt: Date.now(),
      });
      saveState();
      scheduleRender();
      scheduleDomScan();
      showToast(
        conflicts.length > 0
          ? '已强制加入，冲突课程已标红。'
          : '已加入预选课表。',
      );
    }

    function removePlanned(courseId) {
      if (!state) return;
      const index = state.planned.findIndex((course) => course.id === courseId);
      if (index < 0) return;
      pushHistory();
      state.planned.splice(index, 1);
      saveState();
      scheduleRender();
      scheduleDomScan();
    }

    function undo() {
      if (!state || state.history.length === 0) {
        showToast('没有可以撤销的操作。');
        return;
      }
      state.planned = state.history.pop();
      saveState();
      scheduleRender();
      scheduleDomScan();
    }

    function clearPlanned() {
      if (!state || state.planned.length === 0) return;
      if (!window.confirm('清空当前预选课表？正式已选课程不会受影响。')) return;
      pushHistory();
      state.planned = [];
      saveState();
      scheduleRender();
      scheduleDomScan();
    }

    function refreshFromPage() {
      if (!state) return;
      scanVueData();
      injectCourseButtons();
      const catalogIds = new Set(state.catalog.map((course) => course.id));
      state.planned = state.planned.map((course) => ({
        ...course,
        stale: !catalogIds.has(course.id),
      }));
      saveState();
      scheduleRender();
      showToast('已重新扫描页面课程数据。');
    }

    function markStaleCourses() {
      if (!state) return;
      const catalogIds = new Set(state.catalog.map((course) => course.id));
      state.planned = state.planned.map((course) => ({
        ...course,
        stale: !catalogIds.has(course.id),
      }));
      state.official = state.official.map((course) => ({
        ...course,
        stale: !catalogIds.has(course.id),
      }));
    }

    function showToast(message) {
      if (!shadow) return;
      const previous = shadow.querySelector('.toast');
      if (previous) previous.remove();
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      shadow.querySelector('.planner')?.appendChild(toast);
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.remove(), 2600);
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function colorForCourse(course) {
      const seed = course.courseCode || course.courseName || course.id;
      let hash = 0;
      for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * 31 + seed.charCodeAt(index)) % 360;
      }
      return {
        background: `hsl(${hash} 72% 93%)`,
        border: `hsl(${hash} 55% 58%)`,
        text: `hsl(${hash} 65% 25%)`,
      };
    }

    function formatMeeting(meeting) {
      const day = DAYS.find((item) => item.value === meeting.day)?.label || '未知';
      const periods =
        meeting.startPeriod === meeting.endPeriod
          ? `第${meeting.startPeriod}节`
          : `第${meeting.startPeriod}-${meeting.endPeriod}节`;
      const weeks = meeting.weeksKnown ? meeting.weeksText || '周次已识别' : '周次未标明';
      return `${day} ${periods} ${weeks}`;
    }

    function formatMeetingPeriods(meeting) {
      return meeting.startPeriod === meeting.endPeriod
        ? `第${meeting.startPeriod}节`
        : `第${meeting.startPeriod}-${meeting.endPeriod}节`;
    }

    function formatMeetingCompact(meeting) {
      const weeks = meeting.weeksKnown
        ? meeting.weeksText || `第${meeting.weeks.join('、')}周`
        : '周次未标明';
      return `${weeks} ${formatMeetingPeriods(meeting)}`;
    }

    function buildDayItems(courses) {
      const dayItems = new Map(DAYS.map((day) => [day.value, []]));
      courses.forEach((course) => {
        const meetingsByDay = new Map();
        course.meetings.forEach((meeting) => {
          if (!meetingsByDay.has(meeting.day)) meetingsByDay.set(meeting.day, []);
          meetingsByDay.get(meeting.day).push(meeting);
        });

        meetingsByDay.forEach((meetings, day) => {
          core.mergeDisplayMeetings(meetings).forEach((displayMeeting) => {
            const schedules = displayMeeting.schedules.filter((meeting) =>
              core.meetingAppliesToWeek(meeting, state.weekMode),
            );
            if (schedules.length === 0) return;
            dayItems.get(day).push({
              course,
              meeting: {
                day,
                startPeriod: displayMeeting.startPeriod,
                endPeriod: displayMeeting.endPeriod,
              },
              schedules,
            });
          });
        });
      });

      dayItems.forEach((items, day) => {
        const groups = [];
        const sorted = [...items].sort(
          (left, right) =>
            left.meeting.startPeriod - right.meeting.startPeriod ||
            left.meeting.endPeriod - right.meeting.endPeriod,
        );

        sorted.forEach((item) => {
          const group = groups.find((candidate) =>
            candidate.some(
              (other) =>
                other.meeting.startPeriod <= item.meeting.endPeriod &&
                item.meeting.startPeriod <= other.meeting.endPeriod,
            ),
          );
          if (group) group.push(item);
          else groups.push([item]);
        });

        groups.forEach((group) => {
          const columns = [];
          group.forEach((item) => {
            let columnIndex = columns.findIndex((column) =>
              column.every(
                (other) =>
                  other.meeting.endPeriod < item.meeting.startPeriod ||
                  item.meeting.endPeriod < other.meeting.startPeriod,
              ),
            );
            if (columnIndex < 0) {
              columnIndex = columns.length;
              columns.push([]);
            }
            columns[columnIndex].push(item);
            item.column = columnIndex;
          });
          group.forEach((item) => {
            item.columns = columns.length;
          });
        });
        dayItems.set(day, sorted);
      });
      return dayItems;
    }

    function renderMeetingBlock(item, conflictIds) {
      const { course, meeting } = item;
      const top = (meeting.startPeriod - 1) * ROW_HEIGHT + 2;
      const height =
        (meeting.endPeriod - meeting.startPeriod + 1) * ROW_HEIGHT - 5;
      const width = 100 / (item.columns || 1);
      const left = width * (item.column || 0);
      const colors = colorForCourse(course);
      const conflict = conflictIds.has(course.id);
      const status = course.official ? '已选' : '预选';
      const stale = course.stale ? ' · 数据失效' : '';
      const schedules = item.schedules || [meeting];
      const tooltip = [
        `${course.courseName}（${status}${stale}）`,
        course.teacher || '教师未标明',
        ...schedules.map((schedule) => formatMeeting(schedule)),
      ]
        .filter(Boolean)
        .join('\n');
      const scheduleHtml =
        `
          <div class="meeting-schedules">
            ${schedules
              .map(
                (schedule) =>
                  `<span>${escapeHtml(formatMeetingCompact(schedule))}</span>`,
              )
              .join('')}
          </div>
        `;

      return `
        <div
          class="meeting ${course.official ? 'official' : 'planned'} ${conflict ? 'conflict' : ''}"
          style="
            top:${top}px;
            height:${height}px;
            left:calc(${left}% + 2px);
            width:calc(${width}% - 4px);
            background:${colors.background};
            border-color:${conflict ? '#d92d20' : colors.border};
            color:${colors.text};
          "
          title="${escapeHtml(tooltip)}"
          data-course-id="${encodeURIComponent(course.id)}"
        >
          <strong>${escapeHtml(course.courseName)}</strong>
          <span class="meeting-teacher">${escapeHtml(course.teacher || '教师未标明')}</span>
          ${scheduleHtml}
          ${conflict ? '<em>冲突</em>' : ''}
        </div>
      `;
    }

    function renderWeekGrid() {
      const courses = activeCourses();
      const conflictIds = core.detectConflictIds(courses, state.weekMode);
      const dayItems = buildDayItems(courses);
      const header = DAYS.map(
        (day) => `<div class="day-head">${day.label}</div>`,
      ).join('');
      const timeColumn = TIME_TABLE.map(
        (item) => `
          <div class="time-cell">
            <strong>${item.period}</strong>
            <span>${item.start}</span>
            <span>${item.end}</span>
          </div>
        `,
      ).join('');
      const dayColumns = DAYS.map((day) => {
        const periodCells = TIME_TABLE.map(
          () => '<div class="period-cell"></div>',
        ).join('');
        const meetings = (dayItems.get(day.value) || [])
          .map((item) => renderMeetingBlock(item, conflictIds))
          .join('');
        return `<div class="day-col">${periodCells}${meetings}</div>`;
      }).join('');

      return `
        <div class="week-grid">
          <div class="grid-corner">节次</div>
          ${header}
          <div class="time-col">${timeColumn}</div>
          ${dayColumns}
        </div>
      `;
    }

    function renderCourseRow(course, official) {
      const status = official ? '已选' : '预选';
      const stale = course.stale ? ' · 数据失效' : '';
      const warnings = course.warnings?.length
        ? ` · ${course.warnings.join('、')}`
        : '';
      return `
        <div class="course-row ${course.official ? 'is-official' : ''}">
          <div>
            <strong>${escapeHtml(course.courseName)}</strong>
            <span>${escapeHtml(course.className || '')}</span>
            <small>${escapeHtml(`${status}${stale}${warnings}`)}</small>
          </div>
          ${
            official
              ? '<span class="pill">正式</span>'
              : `<button type="button" data-action="remove-planned" data-course-id="${encodeURIComponent(
                  course.id,
                )}">移除</button>`
          }
        </div>
      `;
    }

    function renderCourseLists() {
      const officialRows = state.official.map((course) =>
        renderCourseRow(course, true),
      );
      const plannedRows = state.planned.map((course) =>
        renderCourseRow(course, false),
      );
      const rows = [...officialRows, ...plannedRows].join('');
      return `
        <section class="section">
          <div class="section-title">
            <h4>课程清单</h4>
            <span>${state.official.length} 正式 / ${state.planned.length} 预选</span>
          </div>
          <div class="course-list">
            ${rows || '<div class="empty">尚未选择课程</div>'}
          </div>
        </section>
      `;
    }

    function renderPending() {
      const pending = [...state.official, ...state.planned].filter(
        (course) =>
          course.meetings.length === 0 ||
          (course.warnings && course.warnings.length > 0),
      );
      if (pending.length === 0) return '';
      return `
        <section class="section">
          <div class="section-title">
            <h4>待处理课程</h4>
            <span>${pending.length}</span>
          </div>
          <div class="pending-list">
            ${pending
              .map(
                (course) => `
                  <div class="pending-row">
                    <strong>${escapeHtml(course.courseName)}</strong>
                    <span>${escapeHtml(
                      course.warnings?.join('、') || '未解析到时间',
                    )}</span>
                  </div>
                `,
              )
              .join('')}
          </div>
        </section>
      `;
    }

    function catalogStatus(course) {
      const official = findOfficialByCourse(course);
      if (official) return { text: '已选', disabled: true };
      const planned = findPlannedByCourse(course);
      if (planned) return { text: '已预选', disabled: true };
      return { text: '+ 预选', disabled: false };
    }

    function filteredCatalog() {
      const query = core.normalizeText(catalogQuery).toLowerCase();
      return state.catalog
        .filter((course) => {
          if (!query) return true;
          return [course.courseName, course.courseCode, course.teacher, course.className]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
        })
        .sort((left, right) =>
          left.courseName.localeCompare(right.courseName, 'zh-CN'),
        )
        .slice(0, 80);
    }

    function renderCatalogList() {
      const courses = filteredCatalog();
      if (courses.length === 0) {
        return '<div class="empty">当前没有已加载课程</div>';
      }
      return courses
        .map((course) => {
          const status = catalogStatus(course);
          return `
            <div class="catalog-row">
              <div>
                <strong>${escapeHtml(course.courseName)}</strong>
                <span>${escapeHtml(course.className || course.teacher || '')}</span>
                <small>${escapeHtml(
                  course.meetings.map(formatMeeting).join('；') || '时间未识别',
                )}</small>
              </div>
              <button
                type="button"
                data-action="add-course"
                data-course-id="${encodeURIComponent(course.id)}"
                ${status.disabled ? 'disabled' : ''}
              >${status.text}</button>
            </div>
          `;
        })
        .join('');
    }

    function renderCatalog() {
      return `
        <section class="section">
          <details class="catalog-details">
            <summary>
              <span>已加载课程</span>
              <strong>${state.catalog.length}</strong>
            </summary>
            <input
              class="catalog-search"
              type="search"
              placeholder="搜索课程名、课程号或教师"
              value="${escapeHtml(catalogQuery)}"
            >
            <div id="seu-catalog-list" class="catalog-list">
              ${renderCatalogList()}
            </div>
          </details>
        </section>
      `;
    }

    function renderWeekSelect() {
      const options = [
        ['all', '全部周次'],
        ['odd', '单周'],
        ['even', '双周'],
        ...range(1, TOTAL_WEEKS).map((week) => [String(week), `第 ${week} 周`]),
      ];
      return `
        <select data-action="week-mode">
          ${options
            .map(
              ([value, label]) =>
                `<option value="${value}" ${
                  state.weekMode === value ? 'selected' : ''
                }>${label}</option>`,
            )
            .join('')}
        </select>
      `;
    }

    function render() {
      if (!shadow || !state) return;
      renderQueued = false;
      const currentContent = shadow.querySelector('.content');
      const previousScrollTop = currentContent ? currentContent.scrollTop : 0;
      const catalogWasOpen = Boolean(
        shadow.querySelector('.catalog-details')?.open,
      );
      shadow.innerHTML = `
        <style>${panelCss()}</style>
        <div
          class="planner ${state.collapsed ? 'collapsed' : ''}"
          style="${
            state.panelPosition
              ? `left:${state.panelPosition.x}px;top:${state.panelPosition.y}px;right:auto;`
              : ''
          }"
        >
          <button class="collapsed-tab" type="button" data-action="toggle">
            预选课表
          </button>
          <div class="panel">
            <header class="header">
              <span class="drag-grip" title="拖动窗口"></span>
              <div class="header-copy">
                <h3>预选课表</h3>
                <p>${escapeHtml(
                  `${context.schoolTerm} · ${context.batchCode}`,
                )}</p>
              </div>
              <button type="button" data-action="toggle" title="收起">收起</button>
            </header>
            <div class="toolbar">
              ${renderWeekSelect()}
              <button type="button" data-action="undo">撤销</button>
              <button type="button" data-action="refresh">刷新</button>
              <button type="button" data-action="clear">清空</button>
            </div>
            <div class="content">
              ${renderWeekGrid()}
              ${renderPending()}
              ${renderCourseLists()}
              ${renderCatalog()}
            </div>
          </div>
        </div>
      `;
      const nextContent = shadow.querySelector('.content');
      const catalogDetails = shadow.querySelector('.catalog-details');
      if (catalogWasOpen && catalogDetails) catalogDetails.open = true;
      if (nextContent) nextContent.scrollTop = previousScrollTop;
      applyPanelPosition();
    }

    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      window.setTimeout(render, 0);
    }

    function refreshCatalogList() {
      const list = shadow?.querySelector('#seu-catalog-list');
      if (list) list.innerHTML = renderCatalogList();
    }

    function handleAction(event) {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'toggle') {
        state.collapsed = !state.collapsed;
        saveState();
        scheduleRender();
      } else if (action === 'undo') {
        undo();
      } else if (action === 'refresh') {
        refreshFromPage();
      } else if (action === 'clear') {
        clearPlanned();
      } else if (action === 'remove-planned') {
        removePlanned(resolveCourseId(target.dataset.courseId));
      } else if (action === 'add-course') {
        const courseId = resolveCourseId(target.dataset.courseId);
        const course = state.catalog.find((item) => item.id === courseId);
        if (course) addCourse(course);
      }
    }

    function handleChange(event) {
      const target = event.target;
      if (target.matches('[data-action="week-mode"]')) {
        state.weekMode = target.value;
        saveState();
        scheduleRender();
      }
    }

    function handleInput(event) {
      if (event.target.matches('.catalog-search')) {
        catalogQuery = event.target.value;
        refreshCatalogList();
      }
    }

    function clampPanelPosition(x, y) {
      const planner = shadow?.querySelector('.planner');
      const width = planner?.offsetWidth || PANEL_WIDTH;
      const height = planner?.offsetHeight || 360;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - width - margin);
      const maxY = Math.max(margin, window.innerHeight - height - margin);
      return {
        x: Math.min(Math.max(margin, x), maxX),
        y: Math.min(Math.max(margin, y), maxY),
      };
    }

    function applyPanelPosition() {
      if (!state?.panelPosition) return;
      const planner = shadow?.querySelector('.planner');
      if (!planner) return;
      const position = clampPanelPosition(
        state.panelPosition.x,
        state.panelPosition.y,
      );
      state.panelPosition = position;
      planner.style.left = `${position.x}px`;
      planner.style.top = `${position.y}px`;
      planner.style.right = 'auto';
    }

    function handlePointerDown(event) {
      const grip = event.target.closest?.('.drag-grip');
      if (!grip || event.button !== 0) return;
      const planner = grip.closest('.planner');
      if (!planner) return;

      event.preventDefault();
      event.stopPropagation();
      planner.classList.add('dragging');
      const startRect = planner.getBoundingClientRect();
      const offsetX = event.clientX - startRect.left;
      const offsetY = event.clientY - startRect.top;

      const move = (moveEvent) => {
        const position = clampPanelPosition(
          moveEvent.clientX - offsetX,
          moveEvent.clientY - offsetY,
        );
        planner.style.left = `${position.x}px`;
        planner.style.top = `${position.y}px`;
        planner.style.right = 'auto';
      };

      const end = (endEvent) => {
        planner.classList.remove('dragging');
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', end, true);
        window.removeEventListener('pointercancel', end, true);
        const rect = planner.getBoundingClientRect();
        state.panelPosition = clampPanelPosition(rect.left, rect.top);
        saveState();
      };

      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
    }

    function mountUI() {
      if (host || !document.documentElement) return;
      host = document.createElement('div');
      host.className = 'seu-course-planner-host';
      host.style.all = 'initial';
      host.style.position = 'fixed';
      host.style.top = '0';
      host.style.right = '0';
      host.style.bottom = '0';
      host.style.width = '0';
      host.style.height = '0';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'none';
      shadow = host.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(host);
      shadow.addEventListener('click', handleAction);
      shadow.addEventListener('change', handleChange);
      shadow.addEventListener('input', handleInput);
      shadow.addEventListener('pointerdown', handlePointerDown, true);

      ensureContext();
      flushPendingCourses();
      scanVueData();
      scheduleDomScan();
      scheduleRender();
      injectCourseButtons();

      const observer = new MutationObserver(() => scheduleDomScan());
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      scanTimer = window.setInterval(() => {
        ensureContext();
        scanVueData();
        scheduleDomScan();
      }, 2500);
      window.addEventListener('beforeunload', () => {
        if (scanTimer) window.clearInterval(scanTimer);
      });
      window.addEventListener('resize', () => {
        if (state?.panelPosition) applyPanelPosition();
      });
      window.__SEU_COURSE_PLANNER__ = {
        core,
        state,
        addCourse,
        refreshFromPage,
      };
    }

    function panelCss() {
      return `
        :host {
          all: initial;
          color-scheme: light;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select { font: inherit; }
        .planner {
          position: fixed;
          top: 12px;
          right: 12px;
          width: ${PANEL_WIDTH}px;
          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 24px);
          z-index: 2147483647;
          pointer-events: auto;
          color: #1f2937;
        }
        .panel {
          display: flex;
          flex-direction: column;
          max-height: calc(100vh - 24px);
          overflow: hidden;
          border: 1px solid #cfd8e7;
          border-radius: 10px;
          background: #f8fbff;
          box-shadow: 0 16px 44px rgba(15, 35, 72, 0.22);
        }
        .collapsed-tab {
          display: none;
          position: fixed;
          top: 90px;
          right: 0;
          padding: 12px 8px;
          border: 1px solid #2f6fed;
          border-right: 0;
          border-radius: 8px 0 0 8px;
          background: #fff;
          color: #245ac7;
          cursor: pointer;
          writing-mode: vertical-rl;
          letter-spacing: 1px;
        }
        .planner.collapsed .panel { display: none; }
        .planner.collapsed .collapsed-tab { display: block; }
        .header {
          display: grid;
          grid-template-columns: 14px minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
          padding: 13px 14px 11px;
          border-bottom: 1px solid #dbe4f0;
          background: linear-gradient(135deg, #eef6ff, #f8fbff);
          cursor: move;
          user-select: none;
        }
        .drag-grip {
          width: 12px;
          height: 24px;
          border-radius: 5px;
          background-image: radial-gradient(circle, #8192aa 1.3px, transparent 1.4px);
          background-size: 6px 6px;
          cursor: grab;
          touch-action: none;
        }
        .planner.dragging .drag-grip {
          cursor: grabbing;
        }
        .planner.dragging,
        .planner.dragging * {
          user-select: none;
        }
        .header-copy {
          min-width: 0;
        }
        .header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }
        .header p {
          margin: 4px 0 0;
          color: #5b6b82;
          font-size: 11px;
          max-width: 330px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .header button,
        .toolbar button,
        .course-row button,
        .catalog-row button {
          border: 1px solid #b9c9df;
          border-radius: 6px;
          background: #fff;
          color: #27415f;
          cursor: pointer;
        }
        .header button { padding: 5px 9px; font-size: 12px; }
        .toolbar {
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 7px;
          padding: 10px 12px;
          border-bottom: 1px solid #dbe4f0;
          background: #fff;
        }
        .toolbar select {
          min-width: 0;
          padding: 6px 8px;
          border: 1px solid #b9c9df;
          border-radius: 6px;
          color: #27415f;
          background: #fff;
        }
        .toolbar button { padding: 6px 9px; font-size: 12px; }
        .content {
          overflow: auto;
          padding: 10px 12px 16px;
        }
        .week-grid {
          display: grid;
          grid-template-columns: 50px repeat(7, minmax(0, 1fr));
          grid-template-rows: auto auto;
          min-width: 420px;
          border: 1px solid #dbe4f0;
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
        }
        .grid-corner,
        .day-head {
          position: sticky;
          top: 0;
          z-index: 5;
          min-height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 1px solid #dbe4f0;
          background: #edf4ff;
          color: #40546f;
          font-size: 12px;
          font-weight: 700;
        }
        .grid-corner { grid-column: 1; grid-row: 1; }
        .day-head { grid-row: 1; }
        .time-col {
          grid-column: 1;
          grid-row: 2;
        }
        .day-col {
          position: relative;
          grid-row: 2;
          height: ${TIME_TABLE.length * ROW_HEIGHT}px;
          border-left: 1px solid #e3eaf4;
        }
        .time-cell {
          height: ${ROW_HEIGHT}px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1px;
          border-bottom: 1px solid #e3eaf4;
          color: #66758a;
          font-size: 9px;
        }
        .time-cell strong {
          color: #364b67;
          font-size: 12px;
        }
        .period-cell {
          height: ${ROW_HEIGHT}px;
          border-bottom: 1px solid #edf1f7;
        }
        .meeting {
          position: absolute;
          z-index: 3;
          overflow: hidden;
          padding: 4px 5px;
          border: 1px solid;
          border-radius: 6px;
          cursor: default;
        }
        .meeting.planned { border-style: dashed; }
        .meeting.conflict {
          box-shadow: inset 0 0 0 2px rgba(217, 45, 32, 0.22);
        }
        .meeting strong {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          font-size: 10px;
          line-height: 1.22;
        }
        .meeting span {
          display: block;
          margin-top: 2px;
          overflow: hidden;
          font-size: 8px;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .meeting-schedules {
          margin-top: 2px;
        }
        .meeting-schedules span {
          margin-top: 1px;
          font-size: 8px;
          line-height: 1.15;
          overflow-wrap: anywhere;
          white-space: normal;
        }
        .meeting em {
          position: absolute;
          right: 2px;
          bottom: 1px;
          color: #b42318;
          font-size: 8px;
          font-style: normal;
          font-weight: 700;
        }
        .section {
          margin-top: 12px;
          border: 1px solid #dbe4f0;
          border-radius: 8px;
          background: #fff;
        }
        .section-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 11px;
          border-bottom: 1px solid #e4ebf4;
        }
        .section-title h4 {
          margin: 0;
          font-size: 13px;
        }
        .section-title span {
          color: #6c7c91;
          font-size: 11px;
        }
        .course-list,
        .pending-list,
        .catalog-list {
          display: grid;
          gap: 1px;
          background: #e8eef6;
        }
        .course-row,
        .catalog-row,
        .pending-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          background: #fff;
        }
        .course-row div,
        .catalog-row div,
        .pending-row {
          min-width: 0;
        }
        .course-row strong,
        .catalog-row strong,
        .pending-row strong {
          display: block;
          overflow: hidden;
          color: #24364d;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .course-row span,
        .catalog-row span,
        .pending-row span {
          display: block;
          overflow: hidden;
          color: #66758a;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .course-row small,
        .catalog-row small {
          display: block;
          margin-top: 2px;
          overflow: hidden;
          color: #8a97a8;
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .course-row button,
        .catalog-row button {
          flex: 0 0 auto;
          padding: 4px 8px;
          font-size: 11px;
        }
        .course-row button:disabled,
        .catalog-row button:disabled {
          cursor: default;
          opacity: 0.6;
        }
        .pill {
          flex: 0 0 auto;
          padding: 3px 7px;
          border-radius: 999px;
          background: #e8f2ff;
          color: #245ac7;
          font-size: 10px;
        }
        .empty {
          padding: 16px 10px;
          background: #fff;
          color: #8996a8;
          text-align: center;
          font-size: 11px;
        }
        .catalog-details summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 11px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
        }
        .catalog-details summary strong {
          padding: 1px 7px;
          border-radius: 999px;
          background: #edf4ff;
          color: #245ac7;
          font-size: 10px;
        }
        .catalog-search {
          width: calc(100% - 20px);
          margin: 0 10px 9px;
          padding: 6px 8px;
          border: 1px solid #c5d2e4;
          border-radius: 6px;
          outline: none;
        }
        .catalog-search:focus {
          border-color: #2f6fed;
          box-shadow: 0 0 0 2px rgba(47, 111, 237, 0.12);
        }
        .toast {
          position: absolute;
          right: 16px;
          bottom: 16px;
          max-width: 330px;
          padding: 9px 12px;
          border-radius: 8px;
          background: rgba(28, 40, 58, 0.94);
          color: #fff;
          font-size: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        @media (max-width: 720px) {
          .planner { top: 6px; right: 6px; width: calc(100vw - 12px); }
          .content { padding: 8px; }
          .week-grid { min-width: 390px; }
        }
      `;
    }

    installNetworkHooks();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountUI, { once: true });
    } else {
      mountUI();
    }
  }
})();
