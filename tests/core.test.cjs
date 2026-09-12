'use strict';

const assert = require('node:assert/strict');
const {
  TIME_TABLE,
  parseWeekList,
  parseMeetingsFromText,
  normalizeCourse,
  extractCourses,
  meetingsConflict,
  detectConflictIds,
} = require('../seu-course-planner.user.js');

assert.deepEqual(
  TIME_TABLE.map(({ period, start, end }) => `${period}:${start}-${end}`),
  [
    '1:08:00-08:45',
    '2:08:50-09:35',
    '3:09:50-10:35',
    '4:10:40-11:25',
    '5:11:30-12:15',
    '6:14:00-14:45',
    '7:14:50-15:35',
    '8:15:50-16:35',
    '9:16:40-17:25',
    '10:17:30-18:15',
    '11:19:00-19:45',
    '12:19:50-20:35',
    '13:20:40-21:25',
  ],
);

assert.deepEqual(parseWeekList('1-16周', 16).weeks, [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
]);
assert.deepEqual(parseWeekList('1-16周(单)', 16).weeks, [
  1, 3, 5, 7, 9, 11, 13, 15,
]);
assert.deepEqual(parseWeekList('2-8周(双)', 16).weeks, [2, 4, 6, 8]);

const parsedMeetings = parseMeetingsFromText(
  '1-16周 星期一 第1-2节；9-16周 星期三 第6-7节',
);
assert.equal(parsedMeetings.length, 2);
assert.deepEqual(parsedMeetings[0], {
  day: 1,
  startPeriod: 1,
  endPeriod: 2,
  weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  weeksKnown: true,
  weeksText: '1-16周 星期一 第1-2节',
});

const commaSeparatedMeetings = parseMeetingsFromText(
  '1周 星期一 6-9节 教二-309,1周 星期四 6-10节 教二-309',
);
assert.equal(commaSeparatedMeetings.length, 2);
assert.deepEqual(
  commaSeparatedMeetings.map((meeting) => [
    meeting.day,
    meeting.startPeriod,
    meeting.endPeriod,
  ]),
  [
    [1, 6, 9],
    [4, 6, 10],
  ],
);

const inlineMultiDayMeetings = parseMeetingsFromText(
  '1-16周 星期一 1-2节 星期三 3-4节',
);
assert.deepEqual(
  inlineMultiDayMeetings.map((meeting) => [
    meeting.day,
    meeting.startPeriod,
    meeting.endPeriod,
  ]),
  [
    [1, 1, 2],
    [3, 3, 4],
  ],
);

const sharedRangeMeetings = parseMeetingsFromText(
  '1-16周 星期一、星期三 3-4节',
);
assert.deepEqual(
  sharedRangeMeetings.map((meeting) => [
    meeting.day,
    meeting.startPeriod,
    meeting.endPeriod,
  ]),
  [
    [1, 3, 4],
    [3, 3, 4],
  ],
);

const course = normalizeCourse({
  KCMC: '线性代数',
  KCH: 'B0000010',
  JXBID: 'CLASS-01',
  JXBMC: '线性代数01班',
  SKJS: '张老师',
  JASMC: '教一-101',
  XF: '3',
  KCXZ: '必修',
  SKXQ: '1',
  SKJC: '1-2',
  SKZC: '1-16周',
});
assert.equal(course.courseName, '线性代数');
assert.equal(course.courseCode, 'B0000010');
assert.equal(course.meetings[0].day, 1);
assert.equal(course.meetings[0].startPeriod, 1);
assert.equal(course.meetings[0].endPeriod, 2);

const oddCourse = normalizeCourse({
  KCMC: '大学英语',
  KCH: 'E001',
  SKXQ: '1',
  SKJC: '1-2',
  SKZC: '1-16周(单)',
});
const evenCourse = normalizeCourse({
  KCMC: '程序设计',
  KCH: 'C001',
  SKXQ: '1',
  SKJC: '1-2',
  SKZC: '1-16周(双)',
});
assert.equal(
  meetingsConflict(oddCourse.meetings[0], evenCourse.meetings[0], 'all'),
  false,
);
assert.equal(
  meetingsConflict(oddCourse.meetings[0], course.meetings[0], 'all'),
  true,
);
assert.deepEqual(
  [...detectConflictIds([oddCourse, evenCourse], 'all')],
  [],
);

const extracted = extractCourses({
  code: 200,
  data: {
    rows: [
      {
        KCMC: '高等数学',
        KCH: 'M001',
        SKXQ: '3',
        SKJC: '6-7',
        SKZC: '1-16周',
      },
    ],
  },
});
assert.equal(extracted.length, 1);
assert.equal(extracted[0].courseName, '高等数学');

console.log('Core tests passed.');
