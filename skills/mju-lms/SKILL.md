---
name: mju-lms
version: 1.0.0
description: "명지 LMS의 강의, 공지, 자료, 과제, 온라인 학습 흐름을 다루는 기본 skill."
metadata:
  openclaw:
    category: "service"
    domain: "education"
    requires:
      bins: ["mju"]
      skills: ["mju-shared"]
---

# MJU LMS

모든 명령은 `--app-dir /data/users/<DISCORD_USER_ID> --format json` 플래그와 함께 실행됩니다.

## 자주 쓰는 명령
- 강의 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms courses list`
- 공지 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms notices list --course COURSE_NAME`
- 공지 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms notices get --course COURSE_NAME --article-id ARTICLE_ID`
- 자료 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms materials list --course COURSE_NAME`
- 자료 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms materials get --course COURSE_NAME --article-id ARTICLE_ID`
- 과제 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments list --course COURSE_NAME`
- 과제 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments get --course COURSE_NAME --rt-seq RT_SEQ`
- 과제 제출 가능 여부 점검: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments check-submission --course COURSE_NAME --rt-seq RT_SEQ --local-files /path/to/file.pdf`
- 과제 파일 제출: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments submit --course COURSE_NAME --rt-seq RT_SEQ --local-files /path/to/file.pdf --content-source user-file`
- 과제 텍스트 제출: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms assignments submit --course COURSE_NAME --rt-seq RT_SEQ --text "제출 본문" --artifact-format md --content-source user-text`
  - `--artifact-format`은 `txt` 또는 `md`만 지원
  - 초안 정리본처럼 사용자가 작성한 내용을 다듬은 제출물은 `--content-source user-draft-transform` 사용
  - 에이전트가 정답을 직접 생성한 제출물은 받지 않음
- 온라인 학습 주차 목록: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online list --course COURSE_NAME`
- 온라인 학습 주차 상세: `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms online get --course COURSE_NAME --lecture-weeks WEEK`

## helper (집계 명령)
- 액션 아이템 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +action-items --all-courses`
- 미제출 과제 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +unsubmitted --all-courses`
- 마감 임박 과제 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +due-assignments --all-courses`
- 안 읽은 공지 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +unread-notices --all-courses`
- 미완료 온라인 학습 (전체 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +incomplete-online --all-courses`
- 강의 digest (단일 강의): `mju --app-dir /data/users/<DISCORD_USER_ID> --format json lms +digest --course COURSE_NAME`
