# التثبيت

## لكلود كود — على مستوى المشروع

انسخ مجلد `crm-oms-guard` كامل إلى:

```
<جذر-المشروع>/.claude/skills/crm-oms-guard/
```

الشكل النهائي:

```
.claude/skills/crm-oms-guard/
  SKILL.md
  references/
    architecture.md
    invariants.md
    stages.md
    anti-duplication.md
    checklists.md
```

## للاستخدام على كل مشاريعك

```
~/.claude/skills/crm-oms-guard/
```

## التحقق

بعد النسخ، افتح كلود كود بجذر المشروع واكتب:

```
/skills
```

لازم تشوف `crm-oms-guard` بالقائمة.

## الاستخدام

المهارة بتشتغل لحالها عند أي شغل على المشروع. وإذا بدك تجبرها:

```
استخدم crm-oms-guard ونفّذ Stage 0
```

## ملاحظات

- المهارة **لا تغني عن البرومبت الكامل**. البرومبت بيعطي المهمة،
  والمهارة بتمنع الانحراف أثناء التنفيذ.
- حدّث `references/` كل ما يتغير قرار. المهارة وثيقة حية.
- ابدأ كل مرحلة بجلسة نظيفة: `/clear` ثم اسم المرحلة.
