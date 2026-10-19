import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Assistant } from "@/components/assistant";
import { ThemedText } from "@/components/themed-text";
import { Button, Card, Chip, Field, Screen, Segmented } from "@/components/ui";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, type Language } from "@/i18n";
import { formatRate } from "@/lib/commission";
import {
  formatDate,
  formatEuro,
  parseAmount,
  parseBelgianDate,
  toBelgianDate,
} from "@/lib/format";
import { anonHeaders, functionsUrl } from "@/lib/supabase";
import { APP_NAME } from "@/constants/brand";

type Payload = {
  quote: {
    status: string;
    delivery_fee: number | null;
    lead_time_days: number | null;
    valid_until: string | null;
    comment: string | null;
    commission_accepted: boolean;
    prices: Record<string, number>;
  };
  request: {
    title: string;
    postal_code: string;
    city: string | null;
    needed_by: string | null;
    reply_by: string;
    sent_at: string | null;
    fulfilment: "delivery" | "pickup";
    note: string | null;
    status: string;
    company: { name: string; verified_at: string | null } | null;
  };
  items: { id: string; label: string; quantity: number; unit: string }[];
  supplier: { name: string; language: Language; commission_rate: number };
  messages: {
    author: "supplier" | "contractor";
    text: string | null;
    created_at: string;
  }[];
};

/** Public page opened from the supplier e-mail. No account needed. */
export default function SupplierQuoteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, locale, language, setLanguage } = useI18n();
  const theme = useTheme();
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "invalid" | "error" | "sent" | "declined"
  >("loading");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [leadTime, setLeadTime] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [comment, setComment] = useState("");
  const [acceptCommission, setAcceptCommission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    fetch(`${functionsUrl}/supplier-quote?token=${encodeURIComponent(token)}`, {
      headers: anonHeaders,
    })
      .then(async (res) => {
        if (res.status === 404) return setState("invalid");
        if (!res.ok) return setState("error");
        const body = (await res.json()) as Payload;
        setData(body);
        setLanguage(body.supplier.language);
        setPrices(
          Object.fromEntries(
            Object.entries(body.quote.prices).map(([k, v]) => [k, String(v)]),
          ),
        );
        if (body.quote.delivery_fee !== null)
          setDeliveryFee(String(body.quote.delivery_fee));
        if (body.quote.lead_time_days !== null)
          setLeadTime(String(body.quote.lead_time_days));
        if (body.quote.valid_until)
          setValidUntil(toBelgianDate(body.quote.valid_until));
        setComment(body.quote.comment ?? "");
        setAcceptCommission(body.quote.commission_accepted);
        setState("ready");
      })
      .catch(() => setState("error"));
    // The supplier's language is applied once, on load; they can switch afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const post = async (body: object) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${functionsUrl}/supplier-quote`, {
        method: "POST",
        headers: { ...anonHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return true;
      if (json.error === "closed") setError(t.supplier.closed);
      else if (json.error === "missing_prices")
        setError(t.supplier.missingPrices);
      else if (json.error === "invalid_terms")
        setError(t.supplier.invalidTerms);
      else if (json.error === "commission_not_accepted")
        setError(t.supplier.commissionRequired);
      else if (json.error === "invalid_link") setState("invalid");
      else setError(t.common.error);
      return false;
    } catch {
      setError(t.common.error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!data) return;
    const parsed = Object.fromEntries(
      data.items.map((i) => [i.id, parseAmount(prices[i.id] ?? "")]),
    );
    if (Object.values(parsed).some((p) => p === null))
      return setError(t.supplier.missingPrices);
    const fee = parseAmount(deliveryFee || "0");
    const days = Number(leadTime);
    if (fee === null || !leadTime.trim() || !Number.isInteger(days) || days < 0)
      return setError(t.supplier.invalidTerms);
    const valid = validUntil.trim() ? parseBelgianDate(validUntil) : null;
    if (validUntil.trim() && !valid) return setError(t.request.errors.date);
    if (!acceptCommission) return setError(t.supplier.commissionRequired);
    if (
      await post({
        prices: parsed,
        delivery_fee: fee,
        lead_time_days: days,
        valid_until: valid,
        comment,
        accept_commission: true,
      })
    ) {
      setState("sent");
    }
  };

  const ask = async () => {
    if (!data || !question.trim()) return;
    if (await post({ question })) {
      setData({
        ...data,
        messages: [
          ...data.messages,
          {
            author: "supplier",
            text: question.trim(),
            created_at: new Date().toISOString(),
          },
        ],
      });
      setQuestion("");
      setAsked(true);
    }
  };

  const decline = async () => {
    if (await post({ decline: true })) setState("declined");
  };

  const total =
    (data?.items.reduce(
      (sum, i) =>
        sum + (parseAmount(prices[i.id] ?? "") ?? 0) * Number(i.quantity),
      0,
    ) ?? 0) + (parseAmount(deliveryFee || "0") ?? 0);

  const header = (
    <View style={styles.header}>
      <ThemedText type="subtitle" themeColor="signal">
        {APP_NAME}
      </ThemedText>
      <Segmented<Language>
        value={language}
        onChange={setLanguage}
        options={[
          { value: "fr", label: "FR" },
          { value: "nl", label: "NL" },
        ]}
      />
    </View>
  );

  if (state !== "ready" || !data) {
    const message = {
      loading: t.common.loading,
      invalid: t.supplier.invalid,
      error: t.common.error,
      sent: t.supplier.thanks,
      declined: t.supplier.declinedThanks,
      ready: "",
    }[state];
    return (
      <Screen withTabBar={false}>
        {header}
        <Card>
          <ThemedText
            themeColor={
              state === "sent" || state === "declined"
                ? "good"
                : state === "loading"
                  ? "textSecondary"
                  : "danger"
            }
          >
            {message}
          </ThemedText>
        </Card>
      </Screen>
    );
  }

  const { request, items } = data;
  const open =
    request.status === "sent" &&
    ["invited", "submitted"].includes(data.quote.status);
  const unitLabel = (u: string) => t.units[u as keyof typeof t.units] ?? u;

  return (
    <View style={{ flex: 1 }}>
      <Screen withTabBar={false}>
        {header}
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="label" themeColor="textSecondary">
            {t.supplier.title} · {data.supplier.name}
          </ThemedText>
          <ThemedText type="title">{request.title}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t.supplier.from(request.company?.name ?? "")} ·{" "}
            {request.postal_code} {request.city ?? ""}
          </ThemedText>
          <View style={styles.chips}>
            <Chip
              label={
                request.fulfilment === "delivery"
                  ? t.request.delivery
                  : t.request.pickup
              }
            />
            {request.needed_by ? (
              <Chip label={formatDate(request.needed_by, locale)} />
            ) : null}
            {request.sent_at ? (
              <Chip label={t.supplier.sentOn(formatDate(request.sent_at.slice(0, 10), locale))} />
            ) : null}
            <Chip
              label={t.supplier.replyBy(formatDate(request.reply_by, locale))}
              tone="warn"
            />
          </View>
          {request.note ? (
            <ThemedText type="small">{request.note}</ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="good">
            {t.supplier.noAccount}
          </ThemedText>
        </View>

        <Card>
          {items.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.item,
                index > 0 && { borderTopWidth: 1, borderTopColor: theme.line },
              ]}
            >
              <View style={{ flex: 1, minWidth: 200 }}>
                <ThemedText type="smallBold">{item.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {Number(item.quantity)} {unitLabel(item.unit)}
                </ThemedText>
              </View>
              <Field
                label={t.supplier.unitPrice}
                value={prices[item.id] ?? ""}
                onChangeText={(v) => setPrices((p) => ({ ...p, [item.id]: v }))}
                keyboardType="decimal-pad"
                editable={open}
                style={{ maxWidth: 160 }}
              />
            </View>
          ))}
          <View style={styles.wrap}>
            <Field
              label={t.supplier.deliveryFee}
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              keyboardType="decimal-pad"
              editable={open}
            />
            <Field
              label={t.supplier.leadTime}
              value={leadTime}
              onChangeText={setLeadTime}
              keyboardType="number-pad"
              editable={open}
            />
            <Field
              label={t.supplier.validUntil}
              value={validUntil}
              onChangeText={setValidUntil}
              placeholder="15/11/2026"
              editable={open}
            />
          </View>
          <Field
            label={t.supplier.comment}
            value={comment}
            onChangeText={setComment}
            multiline
            editable={open}
            style={{ minHeight: 70 }}
          />
          <View style={styles.total}>
            <ThemedText type="smallBold">{t.supplier.total}</ThemedText>
            <ThemedText
              type="subtitle"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {formatEuro(total, locale)}
            </ThemedText>
          </View>
          {open ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: acceptCommission,
                disabled: data.quote.commission_accepted,
              }}
              disabled={data.quote.commission_accepted}
              onPress={() => setAcceptCommission((v) => !v)}
              style={styles.accept}
            >
              <View
                style={[
                  styles.box,
                  {
                    borderColor: acceptCommission ? theme.brand : theme.line,
                    backgroundColor: acceptCommission
                      ? theme.brand
                      : "transparent",
                  },
                ]}
              >
                {acceptCommission ? (
                  <ThemedText type="smallBold" themeColor="onBrand">
                    ✓
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="small" style={{ flex: 1 }}>
                {t.supplier.acceptCommission(
                  formatRate(data.supplier.commission_rate, locale),
                )}
              </ThemedText>
            </Pressable>
          ) : null}
          {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
          {open ? (
            <>
              <Button
                label={
                  data.quote.status === "submitted"
                    ? t.supplier.update
                    : t.supplier.submit
                }
                variant="signal"
                onPress={submit}
                busy={busy}
              />
              {data.quote.status === "invited" ? (
                <Button
                  label={t.supplier.decline}
                  variant="ghost"
                  small
                  onPress={decline}
                />
              ) : null}
            </>
          ) : (
            <ThemedText themeColor="textSecondary">
              {t.supplier.closed}
            </ThemedText>
          )}
        </Card>

        {request.status === "sent" || data.messages.length ? (
          <Card>
            <ThemedText type="subtitle">{t.questions.askTitle}</ThemedText>
            {data.messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  m.author === "supplier" ? styles.mine : styles.theirs,
                  {
                    backgroundColor:
                      m.author === "supplier"
                        ? theme.backgroundSelected
                        : theme.background,
                  },
                ]}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  {m.author === "supplier"
                    ? data.supplier.name
                    : t.questions.contractor}{" "}
                  · {formatDate(m.created_at.slice(0, 10), locale)}
                </ThemedText>
                <ThemedText type="small">{m.text}</ThemedText>
              </View>
            ))}
            {request.status === "sent" ? (
              <>
                <Field
                  label={t.questions.askField}
                  hint={asked ? t.questions.asked : t.questions.askHint}
                  value={question}
                  onChangeText={setQuestion}
                  multiline
                  style={{ minHeight: 70, textAlignVertical: "top" }}
                />
                <View style={{ alignSelf: "flex-start" }}>
                  <Button
                    label={t.questions.askSend}
                    small
                    busy={busy}
                    disabled={!question.trim()}
                    onPress={ask}
                  />
                </View>
              </>
            ) : null}
          </Card>
        ) : null}
      </Screen>
      <Assistant audience="supplier" token={token} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
  item: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  accept: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.two },
  bubble: { gap: 2, padding: Spacing.two, borderRadius: 10, maxWidth: 560 },
  mine: { alignSelf: "flex-end" },
  theirs: { alignSelf: "flex-start" },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
