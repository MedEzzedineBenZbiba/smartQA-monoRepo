import re
from typing import Optional


# ── Include keywords (SE/fullstack signals) ───────────────────────────────────
INCLUDE_KEYWORDS = [
    # API / networking
    'api', 'endpoint', 'rest', 'graphql', 'webhook', 'http request',
    'http response', 'status code', 'bearer token', 'oauth', 'cors',
    'request body', 'response body', 'payload', 'json response',
    # Frontend
    'react', 'vue', 'angular', 'typescript', 'webpack', 'vite',
    'css module', 'dom element', 'component', 'frontend', 'render',
    'npm', 'node_modules', 'package.json', 'yarn',
    # Backend / server
    'backend', 'middleware', 'router', 'controller', 'endpoint',
    'rest api', 'microservice', 'docker', 'kubernetes', 'nginx',
    'reverse proxy', 'load balancer', 'ssl', 'tls certificate',
    # Database
    'sql query', 'database schema', 'migration', 'orm',
    'foreign key', 'primary key', 'index', 'transaction',
    'postgresql', 'mysql', 'mongodb', 'redis', 'sqlite',
    'db connection', 'query builder', 'knex', 'sequelize',
    'typeorm', 'prisma', 'hibernate', 'sqlalchemy',
    # Auth
    'jwt', 'access token', 'refresh token', 'authentication',
    'authorization', 'session cookie', 'password hash', 'bcrypt',
    'login endpoint', 'signup endpoint', 'oauth2',
    # DevOps / CI
    'dockerfile', 'docker-compose', 'ci pipeline', 'github actions',
    'travis ci', 'jenkins', 'helm chart', 'terraform', 'kubernetes pod',
    'environment variable', 'deploy', 'container registry',
    # Build tools
    'gradle dependency', 'maven', 'pom.xml', 'build.gradle',
    'pip install', 'requirements.txt', 'cargo', 'go.mod',
    'transitive dependency', 'compile-time', 'runtime dependency',
    # Code / language specifics
    'null pointer', 'stack trace', 'segmentation fault',
    'memory leak', 'race condition', 'deadlock', 'async await',
    'promise', 'callback', 'event loop', 'thread pool',
    'type error', 'runtime error', 'compile error',
    'unit test', 'integration test', 'mock', 'stub', 'fixture',
    'pull request', 'code review', 'merge conflict', 'git',
    # Cloud / infra
    'aws', 'azure', 'gcp', 'lambda function', 's3 bucket',
    'cloud storage', 'cdn', 'vpc', 'iam role',
]

# ── Exclude keywords (non-SE domains) ─────────────────────────────────────────
EXCLUDE_KEYWORDS = [
    (r'\bgame\b',         True),
    (r'\bgames\b',        True),
    (r'\bmod\b',          True),
    (r'\bmods\b',         True),
    (r'\bspawn\b',        True),
    (r'\bcraft\b',        True),
    (r'\binventory\b',    True),
    (r'\blevel\b',        True),
    (r'\bquest\b',        True),
    (r'\bnpc\b',          True),
    (r'\bpvp\b',          True),
    (r'\bserver crash\b', True),
    ('minecraft',         False),
    ('vrchat',            False),
    ('kodi',              False),
    ('jellyfin',          False),
    ('goonstation',       False),
    ('tgstation',         False),
    ('warcraft',          False),
    ('hearthstone',       False),
    ('barotrauma',        False),
    ('runescape',         False),
    ('factorio',          False),
    ('stardew',           False),
    ('rimworld',          False),
    ('godot',             False),
    ('minecoloni',        False),
    ('tachiyomi',         False),
    ('kaiserreich',       False),
    ('hoi4',              False),
    ('dcs liberation',    False),
    ('blheli',            False),
    ('esp32',             False),
    ('arduino',           False),
    ('firmware',          False),
    ('embedded',          False),
    ('biblatex',          False),
    ('latex',             False),
    (r'\bbiber\b',        True),
    (r'\btex\b',          True),
    ('a32nx',             False),
    ('msfs',              False),
    ('flightplan',        False),
    ('airbus',            False),
    ('flybywiresim',      False),
]

# Pre-compile patterns
_include_compiled = [
    re.compile(r'\b' + re.escape(kw) + r'\b', re.IGNORECASE)
    for kw in INCLUDE_KEYWORDS
]

_exclude_compiled = [
    (re.compile(p, re.IGNORECASE) if is_re else None, p, is_re)
    for p, is_re in EXCLUDE_KEYWORDS
]


def strip_code(text: str) -> str:
    """Remove code blocks, stack traces, URLs, HTML tags from text."""
    text = re.sub(r"```[\s\S]*?```", " [CODE] ", text)
    text = re.sub(r"(?m)^( {4}|\t).+", " ", text)
    text = re.sub(r"`[^`\n]*`", " ", text)
    text = re.sub(r"\s+at\s+[\w\.$]+\([\w\.]+:\d+\)", " ", text)
    text = re.sub(r"(/[\w.\-/]+|[A-Z]:\\[\w\\.\-]+)", " ", text)
    text = re.sub(r"0x[0-9a-fA-F]+", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[^a-zA-Z0-9\s.,!?:()\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.lower()


def enforce_length(text: str, min_w: int = 15, max_w: int = 180) -> Optional[str]:
    """Drop too-short texts, smart-truncate too-long ones."""
    words = text.split()
    if len(words) < min_w:
        return None
    if len(words) > max_w:
        sentences = text.split(". ")
        result = sentences[0]
        for sent in sentences[1:]:
            if len((result + ". " + sent).split()) <= max_w:
                result += ". " + sent
            else:
                break
        return result
    return text


def _has_exclude_match(text: str) -> bool:
    text_lower = text.lower()
    for compiled, raw, is_re in _exclude_compiled:
        if is_re:
            if compiled.search(text_lower):
                return True
        else:
            if raw in text_lower:
                return True
    return False


def _count_include_matches(text: str) -> int:
    return sum(1 for p in _include_compiled if p.search(text))


def is_relevant(text: str, min_matches: int = 1) -> bool:
    if _has_exclude_match(text):
        return False
    return _count_include_matches(text) >= min_matches


class DataPreparationService:
    """
    Cleans and validates a raw GitHub issue (title + body).
    Mirrors the logic from smartqa_datapreparation.py.
    """

    def prepare(
        self, issue_title: str, issue_body: str
    ) -> tuple[Optional[str], bool, Optional[str]]:
        """
        Clean and validate a single issue.

        Returns:
            (clean_text, is_relevant, rejection_reason)
        """
        # Basic non-empty check
        title = issue_title.strip()
        body = issue_body.strip()

        if not title:
            return None, False, "Empty title"
        if not body:
            return None, False, "Empty body"

        # Word count pre-check
        if len(title.split()) < 2:
            return None, False, "Title too short (< 4 words)"
        if len(body.split()) < 10:
            return None, False, "Body too short (< 10 words)"

        # Clean
        title_clean = strip_code(title)
        body_clean = strip_code(body)
        text = title_clean + ". " + body_clean

        # Enforce length
        text = enforce_length(text)
        if text is None:
            return None, False, "Text too short after cleaning (< 15 words)"

        if len(text.split()) <= 20:
            return None, False, "Text too short after cleaning (≤ 20 words)"

        # # Domain relevance filter
        if not is_relevant(text):
            return None, False, "Not relevant to software engineering domain"

        return text, True, None


data_preparation_service = DataPreparationService()
