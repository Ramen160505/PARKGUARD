import React, { useEffect, useState } from "react";
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, Image, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { getParkingVerdict, getRemainingMs } from "./src/parkingRules";

const STORAGE_KEY = "parkguard.session.v1";
type ParkingRecord = { latitude: number; longitude: number; savedAt: number };
type Session = { photoUri?: string; latitude?: number; longitude?: number; expiresAt?: number; history?: ParkingRecord[]; checks?: Record<string, boolean> };
const PARKING_CHECKS = [
  { id: "signs", label: "Перевірив усі дорожні знаки поруч" },
  { id: "markings", label: "Перевірив дорожню розмітку" },
  { id: "crossing", label: "Не перекриваю пішохідний перехід або велодоріжку" },
  { id: "access", label: "Не перекриваю в’їзд, виїзд чи доступ спецслужб" },
  { id: "local", label: "Перевірив місцеві обмеження та спосіб оплати" }
];

export default function App() {
  const [session, setSession] = useState<Session>({});
  const [remaining, setRemaining] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false
      })
    });
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status !== "granted") return;
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => { if (value) setSession(JSON.parse(value)); })
      .catch(() => Alert.alert("Не вдалося завантажити дані", "Попередній сеанс може бути недоступний."))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)).catch(() => {
      Alert.alert("Не вдалося зберегти дані", "Перевірте вільне місце на пристрої.");
    });
  }, [session, ready]);

  useEffect(() => {
    const tick = () => setRemaining(session.expiresAt ? getRemainingMs(session.expiresAt) : 0);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.expiresAt]);

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Потрібен доступ до фото", "Дозвольте доступ до медіатеки або зробіть фото камерою.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setSession(s => ({ ...s, photoUri: result.assets[0].uri }));
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Потрібен доступ до камери", "Дозвольте доступ до камери в налаштуваннях пристрою.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setSession(s => ({ ...s, photoUri: result.assets[0].uri }));
  };

  const saveLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Геолокація вимкнена", "Можна користуватися застосунком і без неї.");
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setSession(s => ({ ...s, latitude: position.coords.latitude, longitude: position.coords.longitude, history: [{ latitude: position.coords.latitude, longitude: position.coords.longitude, savedAt: Date.now() }, ...(s.history ?? [])].slice(0, 10) }));
      Alert.alert("Місце збережено", "Координати збережені на цьому пристрої.");
    } catch {
      Alert.alert("Не вдалося визначити місце", "Перевірте GPS і спробуйте ще раз надворі.");
    }
  };

  const openSavedLocation = async () => {
    if (session.latitude == null || session.longitude == null) return;
    const url = `https://maps.google.com/?q=${session.latitude},${session.longitude}`;
    try { await Linking.openURL(url); }
    catch { Alert.alert("Не вдалося відкрити карту", "Спробуйте скопіювати координати вручну."); }
  };

  const startTimer = async (minutes: number) => {
    try {
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Нагадування вимкнені", "Дозволь сповіщення, щоб отримати нагадування про завершення часу.");
        setSession(s => ({ ...s, expiresAt: Date.now() + minutes * 60000 }));
        return;
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "PARKGUARD · Час перевірити авто",
          body: "Твій паркувальний таймер завершився. Перевір автомобіль і місцеві обмеження.",
          sound: true
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 }
      });
      setSession(s => ({ ...s, expiresAt: Date.now() + minutes * 60000 }));
      Alert.alert("Нагадування встановлено", `PARKGUARD нагадає через ${minutes} хвилин, якщо сповіщення дозволені системою.`);
    } catch {
      setSession(s => ({ ...s, expiresAt: Date.now() + minutes * 60000 }));
      Alert.alert("Таймер запущено", "Таймер працює, але не вдалося запланувати push-сповіщення.");
    }
  };
  const verdict = getParkingVerdict(!!session.photoUri);
  const time = String(Math.floor(remaining / 60000)).padStart(2, "0") + ":" + String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.eyebrow}>SMART PARKING ASSISTANT</Text>
        <Text style={styles.logo}>PARK<Text style={{ color: "#72A7FF" }}>GUARD</Text></Text>
        <Text style={styles.subtitle}>Твій помічник перед паркуванням</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>01 / Перевір знак</Text>
          <Text style={styles.body}>Зроби фото знака або вибери наявне зображення, щоб не забути перевірити обмеження.</Text>
          {session.photoUri ? <Image source={{ uri: session.photoUri }} style={styles.photo} /> : null}
          <View style={styles.buttons}>
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, styles.flexButton]} onPress={takePhoto}>
              <Text style={styles.primaryText}>Зробити фото</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={[styles.secondary, styles.flexButton]} onPress={choosePhoto}>
              <Text style={styles.secondaryText}>З галереї</Text>
            </TouchableOpacity>
          </View>
          {session.photoUri ? <TouchableOpacity accessibilityRole="button" style={styles.clear} onPress={() => setSession(s => ({ ...s, photoUri: undefined }))}><Text style={styles.muted}>Видалити фото</Text></TouchableOpacity> : null}
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>{verdict.title}</Text>
            <Text style={styles.body}>{verdict.explanation}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>02 / Місце паркування</Text>
          <Text style={styles.body}>{session.latitude != null && session.longitude != null ? `Координати: ${session.latitude.toFixed(5)}, ${session.longitude.toFixed(5)}` : "Збережи місце, щоб швидше знайти автомобіль."}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={saveLocation}><Text style={styles.secondaryText}>⌖ Зберегти моє місце</Text></TouchableOpacity>
          {session.latitude != null && session.longitude != null ? <View style={styles.buttons}>
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, styles.flexButton]} onPress={openSavedLocation}><Text style={styles.primaryText}>Відкрити карту</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={[styles.secondary, styles.flexButton]} onPress={() => setSession(s => ({ ...s, latitude: undefined, longitude: undefined }))}><Text style={styles.secondaryText}>Очистити</Text></TouchableOpacity>
          </View> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>03 / Чекліст перед виходом</Text>
          <Text style={styles.body}>Познач перевірені пункти. Це нагадування, а не юридичне підтвердження дозволу на паркування.</Text>
          {PARKING_CHECKS.map(item => {
            const checked = !!session.checks?.[item.id];
            return <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked }} key={item.id} style={styles.checkItem} onPress={() => setSession(s => ({ ...s, checks: { ...(s.checks ?? {}), [item.id]: !s.checks?.[item.id] } }))}>
              <View style={[styles.checkBox, checked && styles.checkBoxChecked]}><Text style={styles.checkMark}>{checked ? "✓" : ""}</Text></View>
              <Text style={[styles.checkLabel, checked && styles.checkLabelChecked]}>{item.label}</Text>
            </TouchableOpacity>;
          })}
          <Text style={styles.checkSummary}>Перевірено {PARKING_CHECKS.filter(item => session.checks?.[item.id]).length} з {PARKING_CHECKS.length}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.clear} onPress={() => setSession(s => ({ ...s, checks: {} }))}><Text style={styles.muted}>Скинути чекліст</Text></TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>04 / Історія місць</Text>
          <Text style={styles.body}>Останні збережені місця зберігаються локально на цьому пристрої.</Text>
          {(session.history ?? []).length === 0 ? <Text style={[styles.body, { marginTop: 12 }]}>Поки немає збережених місць. Натисни «Зберегти моє місце», щоб додати перший запис.</Text> : (session.history ?? []).map((record, index) => (
            <TouchableOpacity accessibilityRole="button" key={record.savedAt + "-" + index} style={styles.historyItem} onPress={() => Linking.openURL("https://maps.google.com/?q=" + record.latitude + "," + record.longitude).catch(() => Alert.alert("Не вдалося відкрити карту", "Спробуйте ще раз."))}>
              <View style={styles.historyDot}><Text style={styles.historyDotText}>{index + 1}</Text></View>
              <View style={styles.historyText}>
                <Text style={styles.historyTitle}>{new Date(record.savedAt).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Text>
                <Text style={styles.body}>{record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}</Text>
              </View>
              <Text style={styles.historyLink}>Карта ↗</Text>
            </TouchableOpacity>
          ))}
          {(session.history ?? []).length > 0 ? <TouchableOpacity accessibilityRole="button" style={styles.clear} onPress={() => Alert.alert("Очистити історію?", "Цю дію не можна скасувати.", [{ text: "Скасувати", style: "cancel" }, { text: "Очистити", style: "destructive", onPress: () => setSession(s => ({ ...s, history: [] })) }])}><Text style={styles.muted}>Очистити історію</Text></TouchableOpacity> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>05 / Паркувальний таймер</Text>
          <Text accessibilityLabel="Залишок часу" style={styles.timer}>{session.expiresAt ? time : "--:--"}</Text>
          <Text style={styles.body}>{session.expiresAt && remaining === 0 ? "Час завершився. Перевір автомобіль." : "Обери тривалість нагадування. Якщо дозволити сповіщення, застосунок нагадає про завершення таймера навіть коли він не відкритий."}</Text>
          <View style={styles.buttons}>{[30, 60, 120].map(minutes => <TouchableOpacity accessibilityRole="button" key={minutes} style={styles.chip} onPress={() => startTimer(minutes)}><Text style={styles.chipText}>{minutes} хв</Text></TouchableOpacity>)}</View>
          <TouchableOpacity accessibilityRole="button" style={styles.clear} onPress={async () => { try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {} setSession(s => ({ ...s, expiresAt: undefined })); }}><Text style={styles.muted}>Скинути таймер</Text></TouchableOpacity>
        </View>
        <Text style={styles.footer}>MVP 0.2 · Дані зберігаються локально</Text>
        <Text style={styles.disclaimer}>PARKGUARD поки не розпізнає знаки автоматично та не гарантує відсутність штрафу. Завжди перевіряй офіційні знаки й правила дорожнього руху.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0D12" },
  page: { padding: 20, paddingBottom: 36 },
  eyebrow: { color: "#7D8798", fontSize: 11, letterSpacing: 2, marginTop: 18 },
  logo: { fontSize: 35, fontWeight: "900", color: "#F5F7FA", marginTop: 8 },
  subtitle: { color: "#AAB2C0", fontSize: 16, marginBottom: 24 },
  card: { backgroundColor: "#151922", borderColor: "#252C38", borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 16 },
  cardTitle: { color: "#F5F7FA", fontSize: 18, fontWeight: "700", marginBottom: 10 },
  body: { color: "#AAB2C0", fontSize: 14, lineHeight: 21 },
  primary: { backgroundColor: "#72A7FF", borderRadius: 14, padding: 14, alignItems: "center", marginTop: 16 },
  primaryText: { color: "#0B0D12", fontSize: 14, fontWeight: "800" },
  secondary: { borderWidth: 1, borderColor: "#3B4658", borderRadius: 14, padding: 14, alignItems: "center", marginTop: 16 },
  secondaryText: { color: "#F5F7FA", fontWeight: "700", fontSize: 14 },
  flexButton: { flex: 1 },
  notice: { backgroundColor: "#202631", borderRadius: 14, padding: 13, marginTop: 14 },
  noticeTitle: { color: "#FFD37A", fontWeight: "700", fontSize: 15, marginBottom: 5 },
  photo: { width: "100%", height: 190, borderRadius: 14, marginTop: 14, resizeMode: "cover" },
  timer: { fontSize: 42, fontWeight: "800", color: "#72A7FF", marginVertical: 4, fontVariant: ["tabular-nums"] },
  buttons: { flexDirection: "row", gap: 8, marginTop: 2 },
  chip: { flex: 1, backgroundColor: "#252C38", borderRadius: 12, padding: 13, alignItems: "center" },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#252C38" },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: "#586477", alignItems: "center", justifyContent: "center" },
  checkBoxChecked: { backgroundColor: "#72A7FF", borderColor: "#72A7FF" },
  checkMark: { color: "#0B0D12", fontWeight: "900" },
  checkLabel: { flex: 1, color: "#D8DEE8", fontSize: 14, lineHeight: 20 },
  checkLabelChecked: { color: "#7D8798" },
  checkSummary: { color: "#72A7FF", fontSize: 12, fontWeight: "700", marginTop: 8 },
  historyItem: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#252C38", paddingVertical: 12 },
  historyDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#252C38", alignItems: "center", justifyContent: "center" },
  historyDotText: { color: "#72A7FF", fontWeight: "800", fontSize: 12 },
  historyText: { flex: 1, gap: 3 },
  historyTitle: { color: "#F5F7FA", fontWeight: "700", fontSize: 13 },
  historyLink: { color: "#72A7FF", fontSize: 12, fontWeight: "700" },
  chipText: { color: "#F5F7FA", fontWeight: "700" },
  clear: { alignSelf: "center", padding: 12, marginTop: 4 },
  muted: { color: "#7D8798" },
  footer: { textAlign: "center", color: "#7D8798", marginTop: 8 },
  disclaimer: { textAlign: "center", color: "#697384", fontSize: 11, lineHeight: 17, marginTop: 10 }
});
