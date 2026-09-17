import { useEffect, useMemo, useState } from "react";
import { Home, Loader2, Search, X } from "lucide-react";
import {
  geocodeAccommodationAddress,
  searchAccommodation,
  searchAddressSuggestions,
  type AccommodationSearchResult,
  type DayAccommodation,
} from "@/services/course";

type Props = {
  open: boolean;
  dayNumber: number;
  saved: DayAccommodation[];
  onClose: () => void;
  onSelect: (value: DayAccommodation) => void;
};

const SEARCH_DELAY_MS = 300;

export default function AccommodationSearchModal({
  open,
  dayNumber,
  saved,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AccommodationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"search" | "direct">("search");
  const [directName, setDirectName] = useState("");
  const [directAddress, setDirectAddress] = useState("");
  const [directResults, setDirectResults] = useState<AccommodationSearchResult[]>([]);
  const [directLoading, setDirectLoading] = useState(false);
  const [directLocation, setDirectLocation] = useState<AccommodationSearchResult | null>(null);

  const reusable = useMemo(
    () => Array.from(
      new Map(
        saved
          .filter((value) => value.name.trim())
          .map((value) => [`${value.name}|${value.address}`, value]),
      ).values(),
    ),
    [saved],
  );
  const addressResults = results.filter((item) => item.type === "ADDRESS");
  const placeResults = results.filter((item) => item.type === "PLACE");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setError(null);
    setMode("search");
    setDirectName("");
    setDirectAddress("");
    setDirectResults([]);
    setDirectLocation(null);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchAccommodation(query)
        .then((items) => {
          if (!cancelled) setResults(items);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    const normalizedAddress = directAddress.trim();
    if (
      !open
      || mode !== "direct"
      || normalizedAddress.length < 2
      || directLocation?.address === normalizedAddress
    ) {
      setDirectResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setDirectLoading(true);
      void searchAddressSuggestions(normalizedAddress)
        .then((items) => {
          if (!cancelled) setDirectResults(items);
        })
        .finally(() => {
          if (!cancelled) setDirectLoading(false);
        });
    }, SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, mode, directAddress, directLocation]);

  if (!open) return null;

  const choose = (value: Omit<DayAccommodation, "dayNumber">) => {
    onSelect({ ...value, dayNumber });
    onClose();
  };

  const choosePlace = (item: AccommodationSearchResult) => {
    choose({
      name: item.name,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      memo: null,
    });
  };

  const chooseDirectLocation = (item: AccommodationSearchResult) => {
    setDirectAddress(item.address);
    setDirectLocation(item);
    setDirectResults([]);
    if (!directName.trim() && item.name) {
      setDirectName(item.name);
    }
  };

  const addDirect = async () => {
    const name = directName.trim();
    const address = directAddress.trim();
    if (!name) {
      setError("숙소 이름을 입력해 주세요.");
      return;
    }

    setLoading(true);
    const located = directLocation?.address === address
      ? directLocation
      : address
        ? await geocodeAccommodationAddress(address).catch(() => null)
        : null;
    choose({
      name,
      address: located?.address ?? address,
      latitude: located?.latitude ?? null,
      longitude: located?.longitude ?? null,
      memo: null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="accommodation-title"
        className="w-full max-w-xl rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-border p-5">
          <div>
            <h2 id="accommodation-title" className="font-bold">
              Day {dayNumber} 숙소 추가
            </h2>
            <p className="text-xs text-muted-foreground">
              숙소명이나 주소로 검색하거나 직접 등록하세요.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-5">
          <div
            className="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1"
            role="tablist"
            aria-label="숙소 추가 방식"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "search"}
              onClick={() => {
                setMode("search");
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === "search" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"
              }`}
            >
              숙박업소 검색
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "direct"}
              onClick={() => {
                setMode("direct");
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === "direct" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"
              }`}
            >
              직접 등록
            </button>
          </div>

          {mode === "search" && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="호텔·펜션·리조트 이름 또는 주소"
                  className="w-full rounded-xl border border-input py-2.5 pl-10 pr-3 text-sm"
                />
              </div>

              {loading && (
                <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  검색 중...
                </p>
              )}
              {error && <p className="py-3 text-xs text-destructive">{error}</p>}

              {!query.trim() && reusable.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">내가 사용한 숙소</p>
                  {reusable.map((item) => (
                    <button
                      key={`${item.name}-${item.address}`}
                      type="button"
                      onClick={() => choose(item)}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted"
                    >
                      <Home className="mt-0.5 h-4 w-4 text-primary" />
                      <span>
                        <b className="block text-sm">{item.name}</b>
                        <small className="text-muted-foreground">{item.address}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {results.length > 0 && (
                <div className="mt-3 max-h-72 overflow-y-auto">
                  {addressResults.length > 0 && (
                    <div>
                      <p className="sticky top-0 bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
                        관련 주소
                      </p>
                      {addressResults.map((item) => (
                        <button
                          key={`address-${item.longitude}-${item.latitude}`}
                          type="button"
                          onClick={() => {
                            setMode("direct");
                            chooseDirectLocation(item);
                            setError(null);
                          }}
                          className="block w-full border-b border-border px-3 py-3 text-left hover:bg-muted"
                        >
                          <b className="block text-sm">{item.address}</b>
                          <small className="text-primary">이 주소로 숙소 직접 등록</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {placeResults.length > 0 && (
                    <div>
                      <p className="sticky top-0 bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
                        관련 숙박 장소
                      </p>
                      {placeResults.map((item) => (
                        <button
                          key={`place-${item.name}-${item.longitude}`}
                          type="button"
                          onClick={() => choosePlace(item)}
                          className="block w-full border-b border-border px-3 py-3 text-left hover:bg-muted"
                        >
                          <b className="block text-sm">{item.name}</b>
                          <small className="text-muted-foreground">{item.address}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {query.trim().length >= 2 && !loading && results.length === 0 && (
                <div className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-center text-xs text-muted-foreground">
                  등록된 숙박업소를 찾지 못했어요.
                  <button
                    type="button"
                    onClick={() => {
                      setMode("direct");
                      setDirectName(query.trim());
                    }}
                    className="ml-1 font-semibold text-primary underline"
                  >
                    직접 등록하기
                  </button>
                </div>
              )}
            </>
          )}

          {mode === "direct" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="direct-accommodation-name" className="text-xs font-semibold">
                  숙소 이름 <span className="text-destructive">*</span>
                </label>
                <input
                  id="direct-accommodation-name"
                  autoFocus
                  value={directName}
                  onChange={(event) => setDirectName(event.target.value)}
                  maxLength={100}
                  placeholder="예: 바다가 보이는 에어비앤비"
                  className="mt-1.5 w-full rounded-xl border border-input px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="relative">
                <label htmlFor="direct-accommodation-address" className="text-xs font-semibold">
                  주소 <span className="font-normal text-muted-foreground">(선택)</span>
                </label>
                <input
                  id="direct-accommodation-address"
                  value={directAddress}
                  onChange={(event) => {
                    setDirectAddress(event.target.value);
                    setDirectLocation(null);
                  }}
                  maxLength={300}
                  placeholder="건물명 또는 도로명·지번 주소 검색"
                  autoComplete="off"
                  className="mt-1.5 w-full rounded-xl border border-input px-3.5 py-2.5 pr-9 text-sm"
                />
                {directLoading && (
                  <Loader2 className="absolute right-3 top-8 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {directResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
                    {directResults.map((item) => (
                      <button
                        key={`direct-${item.type}-${item.name}-${item.longitude}`}
                        type="button"
                        onClick={() => chooseDirectLocation(item)}
                        className="block w-full border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted"
                      >
                        <b className="block text-sm">{item.name || item.address}</b>
                        {item.name && (
                          <small className="block text-muted-foreground">{item.address}</small>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  건물명이나 주소를 입력한 뒤 검색 결과에서 위치를 선택하세요. 정확한 주소가
                  없으면 이름만 등록할 수도 있습니다.
                </p>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="button"
                disabled={!directName.trim() || loading}
                onClick={addDirect}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {loading ? "위치 확인 중..." : "이 숙소 추가"}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
