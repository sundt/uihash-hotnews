from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol

from trendradar.storage.base import NewsItem


@dataclass(frozen=True)
class ProviderFetchContext:
    project_root: str
    now: datetime
    config: Dict[str, Any]


@dataclass(frozen=True)
class ProviderFetchResult:
    platform_id: str
    platform_name: str
    provider: str
    items: List[NewsItem]
    metric: Dict[str, Any]


class ProviderFetchError(RuntimeError):
    def __init__(self, message: str, *, platform_id: str, provider: str, cause: Optional[BaseException] = None):
        super().__init__(message)
        self.platform_id = platform_id
        self.provider = provider
        self.cause = cause


class Provider(Protocol):
    provider_id: str

    def fetch(
        self,
        *,
        ctx: ProviderFetchContext,
        platform_id: str,
        platform_name: str,
        platform_config: Dict[str, Any],
    ) -> ProviderFetchResult:
        ...
