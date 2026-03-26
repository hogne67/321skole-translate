// lib/useUsage.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { getUsage } from "@/lib/usage";

export function useUsage(uid?: string) {
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!uid) {
      setUsage({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getUsage(uid);
      setUsage(data || {});
    } catch (error) {
      console.error("Failed to load usage", error);
      setUsage({});
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!uid) {
        if (mounted) {
          setUsage({});
          setLoading(false);
        }
        return;
      }

      try {
        const data = await getUsage(uid);

        if (mounted) {
          setUsage(data || {});
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to load usage", error);

        if (mounted) {
          setUsage({});
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [uid]);

  return { usage, loading, reload };
}