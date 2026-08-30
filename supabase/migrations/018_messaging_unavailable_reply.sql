ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS messaging_unavailable_reply text
    NOT NULL DEFAULT 'ابعتلنا مسدج ع رسائل الصفحة وهيتم الرد وتوضيح كل التفاصيل';
