"""
Timeline Cache Service

Provides caching for Morning Brief and Explore timeline APIs.
Cache TTL: 5 minutes (300 seconds)
Max items: 1000 per cache (20 cards × 50 items)
"""

import time
import hashlib
from typing import Any, Dict, List, Optional


class TimelineCache:
    """Simple in-memory cache for timeline data."""
    
    def __init__(self, ttl_seconds: int = 300, max_items: int = 1000):
        """
        Initialize cache.
        
        Args:
            ttl_seconds: Cache time-to-live in seconds (default 5 minutes)
            max_items: Maximum items to cache (default 1000)
        """
        self._ttl = ttl_seconds
        self._max_items = max_items
        self._items: Optional[List[Dict[str, Any]]] = None
        self._created_at: float = 0
        self._config_hash: str = ""
    
    def _compute_config_hash(self, config: Dict[str, Any]) -> str:
        """Compute a hash of the config for cache invalidation."""
        try:
            # Sort dict for consistent hashing
            config_str = str(sorted(config.items()))
            return hashlib.md5(config_str.encode('utf-8')).hexdigest()[:16]
        except Exception:
            return ""
    
    def get(self, config: Optional[Dict[str, Any]] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached items if valid.
        
        Args:
            config: Optional config dict to check for changes
            
        Returns:
            Cached items list or None if cache is invalid
        """
        # Check if cache exists
        if self._items is None:
            return None
        
        # Check TTL
        if (time.time() - self._created_at) >= self._ttl:
            return None
        
        # Check config hash if provided
        if config is not None:
            current_hash = self._compute_config_hash(config)
            if current_hash != self._config_hash:
                return None
        
        return self._items
    
    def set(self, items: List[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> None:
        """
        Store items in cache.
        
        Args:
            items: List of items to cache (will be truncated to max_items)
            config: Optional config dict for invalidation tracking
        """
        # Truncate to max items
        self._items = items[:self._max_items] if len(items) > self._max_items else items
        self._created_at = time.time()
        
        if config is not None:
            self._config_hash = self._compute_config_hash(config)
        else:
            self._config_hash = ""
    
    def invalidate(self) -> None:
        """Clear the cache."""
        self._items = None
        self._created_at = 0
        self._config_hash = ""
    
    def get_slice(self, offset: int, limit: int, config: Optional[Dict[str, Any]] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Get a slice of cached items.
        
        Args:
            offset: Start offset
            limit: Number of items to return
            config: Optional config for validation
            
        Returns:
            Sliced items or None if cache is invalid
        """
        items = self.get(config)
        if items is None:
            return None
        return items[offset:offset + limit]
    
    @property
    def is_valid(self) -> bool:
        """Check if cache is valid (not expired)."""
        if self._items is None:
            return False
        return (time.time() - self._created_at) < self._ttl
    
    @property
    def item_count(self) -> int:
        """Get number of cached items."""
        return len(self._items) if self._items else 0
    
    @property
    def age_seconds(self) -> float:
        """Get cache age in seconds."""
        if self._created_at == 0:
            return float('inf')
        return time.time() - self._created_at


# Global cache instances
brief_timeline_cache = TimelineCache(ttl_seconds=300, max_items=1000)
explore_timeline_cache = TimelineCache(ttl_seconds=300, max_items=1000)
my_tags_cache = TimelineCache(ttl_seconds=300, max_items=500)  # Cache for user's followed tags news


def clear_all_timeline_caches() -> Dict[str, bool]:
    """Clear all timeline caches."""
    brief_timeline_cache.invalidate()
    explore_timeline_cache.invalidate()
    my_tags_cache.invalidate()
    return {
        "brief_cleared": True,
        "explore_cleared": True,
        "my_tags_cleared": True,
    }


def get_cache_status() -> Dict[str, Any]:
    """Get status of all timeline caches."""
    return {
        "brief": {
            "valid": brief_timeline_cache.is_valid,
            "item_count": brief_timeline_cache.item_count,
            "age_seconds": round(brief_timeline_cache.age_seconds, 1),
        },
        "explore": {
            "valid": explore_timeline_cache.is_valid,
            "item_count": explore_timeline_cache.item_count,
            "age_seconds": round(explore_timeline_cache.age_seconds, 1),
        },
        "my_tags": {
            "valid": my_tags_cache.is_valid,
            "item_count": my_tags_cache.item_count,
            "age_seconds": round(my_tags_cache.age_seconds, 1),
        },
    }
