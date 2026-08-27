import { LANGUAGE_TOGGLE_ENABLED } from '../constants/featureFlags'

export type Locale = 'en' | 'ar'

const messages: Record<Locale, Record<string, string>> = {
  en: {
    'nav.browse': 'Browse',
    'nav.myBooking': 'My booking',
    'nav.signIn': 'Sign in',
    'nav.account': 'Account',
    'nav.messages': 'Messages',
    'nav.notifications': 'Notifications',
    'nav.language': 'Language',
    'hero.title': 'Drive your way',
    'booking.pending': 'Waiting for the dealer',
    'booking.approved': 'Approved',
    'subscription.monthly': 'All-inclusive monthly',
    'subscription.firstMonth': 'Due today (first month)',
    'subscription.minimumTerm': 'minimum term',
    'subscription.swap': 'Swap to another car after 30 days',
    'subscription.cancelNotice': 'Cancel with 30-day notice after your minimum term',
    'subscription.payPickup': 'Pay first month online or at pickup',
    'subscription.extend': 'Extend term',
    'subscription.extendTitle': 'Extend subscription',
    'subscription.extendMonths': 'Additional months',
    'subscription.extendConfirm': 'Extend subscription',
    'subscription.reviewTitle': 'Rate your experience',
    'subscription.reviewSubmit': 'Submit review',
    'messages.title': 'Messages',
    'messages.subtitle': 'Messages from CarFlow support and your dealer',
    'messages.inbox': 'Inbox',
    'messages.starred': 'Starred',
    'messages.archived': 'Archived',
    'messages.empty': 'No messages in this folder.',
    'messages.loading': 'Loading…',
    'messages.loadError': 'Failed to load messages',
    'messages.markRead': 'Mark read',
    'messages.markReadError': 'Could not mark message as read',
    'messages.star': 'Star',
    'messages.archive': 'Archive',
    'messages.moveToInbox': 'Move to inbox',
    'messages.moved': 'Message moved',
    'messages.moveError': 'Could not move message',
    'messages.from': 'From',
    'messages.justNow': 'Just now',
    'messages.sent': 'Sent',
    'messages.conversations': 'Conversations',
    'messages.byFolder': 'By folder',
    'messages.selectConversation': 'Select a conversation to read and reply.',
    'messages.reply': 'Reply',
    'messages.replyPlaceholder': 'Write a reply…',
    'messages.send': 'Send',
    'messages.sending': 'Sending…',
    'messages.sentToast': 'Message sent',
    'messages.replyError': 'Could not send reply',
    'messages.dealer': 'Dealer',
    'messages.you': 'You',
    'billing.addCard': 'Add payment method',
    'billing.downloadPdf': 'Download PDF',
    'billing.pdfError': 'Could not download invoice PDF',
    'checkout.promo': 'Promo code',
    'checkout.promoApply': 'Apply',
    'checkout.promoApplied': 'Promo applied',
    'checkout.promoInvalid': 'Invalid promo code',
    'security.2faEnabled': 'Enabled',
    'security.2faDisabled': 'Disabled',
    'security.enable2fa': 'Enable 2FA',
    'security.disable2fa': 'Disable 2FA',
    'security.smsVerify': 'Verify phone',
    'notifications.saved': 'Notification preferences saved',
    'notifications.saveError': 'Could not save preferences',
  },
  ar: {
    'nav.browse': 'تصفح',
    'nav.myBooking': 'حجزي',
    'nav.signIn': 'تسجيل الدخول',
    'nav.account': 'الحساب',
    'nav.messages': 'الرسائل',
    'nav.notifications': 'الإشعارات',
    'nav.language': 'اللغة',
    'hero.title': 'قد بطريقتك',
    'booking.pending': 'في انتظار الوكيل',
    'booking.approved': 'تمت الموافقة',
    'subscription.monthly': 'اشتراك شهري شامل',
    'subscription.firstMonth': 'مستحق اليوم (الشهر الأول)',
    'subscription.minimumTerm': 'الحد الأدنى للمدة',
    'subscription.swap': 'استبدل السيارة بعد 30 يوماً',
    'subscription.cancelNotice': 'إلغاء بإشعار 30 يوماً بعد الحد الأدنى للمدة',
    'subscription.payPickup': 'ادفع الشهر الأول أونلاين أو عند الاستلام',
    'subscription.extend': 'تمديد المدة',
    'subscription.extendTitle': 'تمديد الاشتراك',
    'subscription.extendMonths': 'أشهر إضافية',
    'subscription.extendConfirm': 'تمديد الاشتراك',
    'subscription.reviewTitle': 'قيّم تجربتك',
    'subscription.reviewSubmit': 'إرسال التقييم',
    'messages.title': 'الرسائل',
    'messages.subtitle': 'رسائل من دعم CarFlow ووكيلك',
    'messages.inbox': 'البريد الوارد',
    'messages.starred': 'المميزة',
    'messages.archived': 'الأرشيف',
    'messages.empty': 'لا توجد رسائل في هذا المجلد.',
    'messages.loading': 'جاري التحميل…',
    'messages.loadError': 'تعذر تحميل الرسائل',
    'messages.markRead': 'تعليم كمقروء',
    'messages.markReadError': 'تعذر تعليم الرسالة كمقروءة',
    'messages.star': 'تمييز',
    'messages.archive': 'أرشفة',
    'messages.moveToInbox': 'نقل إلى البريد الوارد',
    'messages.moved': 'تم نقل الرسالة',
    'messages.moveError': 'تعذر نقل الرسالة',
    'messages.from': 'من',
    'messages.justNow': 'الآن',
    'messages.sent': 'المرسل',
    'messages.conversations': 'المحادثات',
    'messages.byFolder': 'حسب المجلد',
    'messages.selectConversation': 'اختر محادثة للقراءة والرد.',
    'messages.reply': 'رد',
    'messages.replyPlaceholder': 'اكتب رداً…',
    'messages.send': 'إرسال',
    'messages.sending': 'جاري الإرسال…',
    'messages.sentToast': 'تم إرسال الرسالة',
    'messages.replyError': 'تعذر إرسال الرد',
    'messages.dealer': 'الوكيل',
    'messages.you': 'أنت',
    'billing.addCard': 'إضافة طريقة دفع',
    'billing.downloadPdf': 'تحميل PDF',
    'billing.pdfError': 'تعذر تحميل فاتورة PDF',
    'checkout.promo': 'رمز ترويجي',
    'checkout.promoApply': 'تطبيق',
    'checkout.promoApplied': 'تم تطبيق الرمز',
    'checkout.promoInvalid': 'رمز ترويجي غير صالح',
    'security.2faEnabled': 'مفعّل',
    'security.2faDisabled': 'معطّل',
    'security.enable2fa': 'تفعيل المصادقة الثنائية',
    'security.disable2fa': 'تعطيل المصادقة الثنائية',
    'security.smsVerify': 'التحقق من الهاتف',
    'notifications.saved': 'تم حفظ تفضيلات الإشعارات',
    'notifications.saveError': 'تعذر حفظ التفضيلات',
  },
}

// With the toggle off the persisted choice is ignored: someone who switched to
// Arabic before it was hidden would otherwise stay stuck in a half-translated
// RTL app with no control to switch back. The stored value is left untouched so
// it returns when the toggle is enabled again.
let currentLocale: Locale = LANGUAGE_TOGGLE_ENABLED
  ? (typeof localStorage !== 'undefined' && (localStorage.getItem('carflow:locale') as Locale)) || 'en'
  : 'en'

const localeListeners = new Set<() => void>()

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('carflow:locale', locale)
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }
  localeListeners.forEach((fn) => fn())
}

export function subscribeLocale(listener: () => void): () => void {
  localeListeners.add(listener)
  return () => localeListeners.delete(listener)
}

export function t(key: string, locale: Locale = currentLocale): string {
  return messages[locale][key] ?? messages.en[key] ?? key
}

// Apply persisted locale on load (Phase 3.5 i18n / RTL).
if (typeof document !== 'undefined') {
  setLocale(currentLocale)
}
