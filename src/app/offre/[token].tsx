import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { Logo } from "@/components/logo";
import { LegalLinks } from "@/components/legal-links";
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

type Payload = {
  quote: {
    status: string;
    delivery_fee: number | null;
    lead_time_days: number | null;
    valid_until: string | null;
    comment: string | null;
    commission_accepted: boolean;
    has_file: boolean;
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
    company: {
      name: string;
      verified_at: string | null;
      vat_number: string | null;
      street: string | null;
      postal_code: string | null;
      city: string | null;
    } | null;
  };
  items: { id: string; label: string; quantity: number; unit: string }[];
  /** commission_rate is null while suppliers answer for free. */
  supplier: {
    name: string;
    language: Language;
    commission_rate: number | null;
    requests_stopped: boolean;
  };
  messages: {
    author: "supplier" | "contractor";
    text: string | null;
    created_at: string;
  }[];
};

/** Public page opened from the supplier e-mail. No account needed. */
export default function SupplierQuoteScreen() {
  const { token, stop } = useLocalSearchParams<{
    token: string;
    stop?: string;
  }>();
  const { t, locale, language, setLanguage } = useI18n();
  const theme = useTheme();
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "invalid" | "error" | "sent" | "declined" | "stopped"
  >("loading");
  const [confirmStop, setConfirmStop] = useState(stop === "1");
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
  const [pdf, setPdf] = useState<{
    busy: boolean;
    attached: boolean;
    note: string | null;
    error: string | null;
  }>({
    busy: false,
    attached: false,
    note: null,
    error: null,
  });

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
        setPdf((s) => ({ ...s, attached: body.quote.has_file }));
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
    const commissionOn = data.supplier.commission_rate !== null;
    if (commissionOn && !acceptCommission)
      return setError(t.supplier.commissionRequired);
    if (
      await post({
        prices: parsed,
        delivery_fee: fee,
        lead_time_days: days,
        valid_until: valid,
        comment,
        accept_commission: commissionOn,
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

  /** Sends the supplier's own PDF quote; Nodi's reading pre-fills the form for them to check. */
  const attachPdf = async () => {
    if (!data) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setPdf((s) => ({ ...s, busy: true, error: null, note: null }));
    try {
      const form = new FormData();
      form.append("token", token);
      if (Platform.OS === "web" && asset.file)
        form.append("file", asset.file, asset.name);
      // React Native's FormData takes a { uri, name, type } file.
      else
        form.append("file", {
          uri: asset.uri,
          name: asset.name,
          type: "application/pdf",
        } as unknown as Blob);
      const res = await fetch(`${functionsUrl}/supplier-quote`, {
        method: "POST",
        headers: anonHeaders,
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = json.error as keyof typeof t.supplier.pdfErrors;
        if (json.error === "closed")
          return setPdf((s) => ({
            ...s,
            busy: false,
            error: t.supplier.closed,
          }));
        return setPdf((s) => ({
          ...s,
          busy: false,
          error: t.supplier.pdfErrors[key] ?? t.common.error,
        }));
      }
      const reading = json.reading as {
        items: { item_id: string; unit_price: number | null }[];
        delivery_fee: number | null;
        lead_time_days: number | null;
        valid_until: string | null;
        note: string;
      } | null;
      let found = 0;
      if (reading) {
        const read = reading.items.filter((i) => i.unit_price !== null);
        found = read.length;
        setPrices((p) => ({
          ...p,
          ...Object.fromEntries(
            read.map((i) => [i.item_id, String(i.unit_price)]),
          ),
        }));
        if (reading.delivery_fee !== null)
          setDeliveryFee(String(reading.delivery_fee));
        if (reading.lead_time_days !== null)
          setLeadTime(String(reading.lead_time_days));
        if (reading.valid_until)
          setValidUntil(toBelgianDate(reading.valid_until));
      }
      const summary =
        reading && found
          ? t.supplier.pdfFilled(found, data.items.length)
          : t.supplier.pdfNotRead;
      setPdf({
        busy: false,
        attached: true,
        error: null,
        note: [summary, reading?.note].filter(Boolean).join(" "),
      });
    } catch {
      setPdf((s) => ({ ...s, busy: false, error: t.common.error }));
    }
  };

  const decline = async () => {
    if (await post({ decline: true })) setState("declined");
  };

  const stopRequests = async () => {
    if (await post({ stop_requests: true })) setState("stopped");
  };

  const total =
    (data?.items.reduce(
      (sum, i) =>
        sum + (parseAmount(prices[i.id] ?? "") ?? 0) * Number(i.quantity),
      0,
    ) ?? 0) + (parseAmount(deliveryFee || "0") ?? 0);

  const header = (
    <View style={styles.header}>
      <Logo size={24} />
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
      stopped: t.supplier.stopped,
      ready: "",
    }[state];
    return (
      <Screen withTabBar={false}>
        {header}
        <Card>
          <ThemedText
            themeColor={
              state === "sent" || state === "declined" || state === "stopped"
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

  if (confirmStop && !data.supplier.requests_stopped) {
    return (
      <Screen withTabBar={false}>
        {header}
        <Card>
          <ThemedText type="subtitle">{t.supplier.stopTitle}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t.supplier.stopLead}
          </ThemedText>
          {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
          <Button
            label={t.supplier.stopConfirm}
            variant="signal"
            busy={busy}
            onPress={stopRequests}
          />
          <Button
            label={t.supplier.stopCancel}
            variant="ghost"
            small
            onPress={() => setConfirmStop(false)}
          />
        </Card>
      </Screen>
    );
  }

  const { request, items } = data;
  const client = request.company;
  const clientLine = client
    ? [
        client.name,
        client.vat_number,
        [
          client.street,
          [client.postal_code, client.city].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join(", "),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
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
            {t.supplier.site(
              `${request.postal_code} ${request.city ?? ""}`.trim(),
            )}
          </ThemedText>
          {clientLine ? (
            <ThemedText type="small">
              {t.supplier.client}: {clientLine}
            </ThemedText>
          ) : null}
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
              <Chip
                label={t.supplier.sentOn(
                  formatDate(request.sent_at.slice(0, 10), locale),
                )}
              />
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
          <ThemedText type="small" themeColor="textSecondary">
            {t.supplier.about}
          </ThemedText>
        </View>

        {open ? (
          <Card>
            <ThemedText type="smallBold">{t.supplier.pdfTitle}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t.supplier.pdfLead}
            </ThemedText>
            <Button
              label={
                pdf.busy
                  ? t.supplier.pdfReading
                  : pdf.attached
                    ? t.supplier.pdfReplace
                    : t.supplier.pdfPick
              }
              variant={pdf.attached ? "ghost" : "signal"}
              busy={pdf.busy}
              onPress={attachPdf}
            />
            {pdf.attached && !pdf.note ? (
              <ThemedText type="small" themeColor="signal">
                {t.supplier.pdfAttached}
              </ThemedText>
            ) : null}
            {pdf.note ? (
              <ThemedText type="small" themeColor="signal">
                {pdf.note}
              </ThemedText>
            ) : null}
            {pdf.error ? (
              <ThemedText type="small" themeColor="danger">
                {pdf.error}
              </ThemedText>
            ) : null}
          </Card>
        ) : null}

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
          {open && data.supplier.commission_rate !== null ? (
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
        <LegalLinks />
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
