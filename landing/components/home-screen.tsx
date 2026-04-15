import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ContactForm } from './contact-form';
import { HeroButton, PageHead, PageScrollFrame, SurfaceCard } from './marketing-shell';

type SectionKey = 'top' | 'about' | 'features' | 'pricing' | 'contact';

const heroBackgroundStyle = {
  // @ts-expect-error web-only CSS background
  backgroundImage:
    'radial-gradient(circle at top center, rgba(255,255,255,0.14), transparent 24%), linear-gradient(180deg, #173154 0%, #1c3b63 44%, #22426d 100%)',
};

const primaryStageStyle = {
  // @ts-expect-error web-only CSS background
  backgroundImage:
    'radial-gradient(circle at top right, rgba(176,138,77,0.24), transparent 32%), linear-gradient(165deg, #163050 0%, #1f3a5f 52%, #24456f 100%)',
};

const mutedWhiteText = { color: 'rgba(255,255,255,0.8)' };
const subtleWhiteText = { color: 'rgba(255,255,255,0.72)' };
const emphasisWhiteText = { color: 'rgba(255,255,255,0.86)' };
const whitePanelStyle = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderColor: 'rgba(255,255,255,0.12)',
};
const stageStatStyle = {
  backgroundColor: 'rgba(255,255,255,0.12)',
};

const problemCards = [
  {
    title: 'Stock updates happen late or not at all',
    body: 'Delayed movements, partial receipts, and disconnected tools create blind spots that compound quickly.',
  },
  {
    title: 'Teams rely on spreadsheets and informal processes',
    body: 'Manual workarounds become critical infrastructure, but they are hard to govern and harder to scale.',
  },
  {
    title: 'One person becomes the system owner',
    body: 'Knowledge concentrates in one operator, leaving the wider business dependent on memory and exception handling.',
  },
  {
    title: 'Reports lose accuracy over time',
    body: 'Reactive updates and inconsistent process discipline make operational reporting progressively less reliable.',
  },
  {
    title: 'Decision-making becomes reactive instead of controlled',
    body: 'Teams spend more time chasing status than running structured workflows that protect margins and service levels.',
  },
];

const featureCards = [
  ['Inventory Visibility', 'See stock positions, movements, and workflow status with more clarity across warehouses, stores, and teams.'],
  ['Reduced Admin Effort', 'Replace repeated manual checking with structured steps that reduce rework and make routine operations faster.'],
  ['Audit-Ready Records', 'Keep a traceable history of what changed, who approved it, and how the action moved through the workflow.'],
  ['Role-Based Access', 'Apply permissions by role so the right people can act, review, or approve without overexposing operational data.'],
  ['Operational Control', 'Run purchasing, stock updates, and approvals inside governed processes rather than disconnected handoffs.'],
  ['Scalable for Growth', 'Support growing catalog complexity, more locations, and wider teams without depending on informal workarounds.'],
] as const;

export function HomeScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const pendingSection = useRef<SectionKey | null>(null);
  const sectionOffsets = useRef<Record<SectionKey, number>>({
    top: 0,
    about: 0,
    features: 0,
    pricing: 0,
    contact: 0,
  });
  const params = useLocalSearchParams<{ section?: string }>();

  const registerSection = (section: SectionKey) => (event: LayoutChangeEvent) => {
    sectionOffsets.current[section] = event.nativeEvent.layout.y;

    if (pendingSection.current === section) {
      requestAnimationFrame(() => {
        scrollToSection(section);
      });
      pendingSection.current = null;
    }
  };

  const scrollToSection = (section: SectionKey) => {
    const target = Math.max(sectionOffsets.current[section] - 88, 0);
    scrollRef.current?.scrollTo({ x: 0, y: target, animated: true });
  };

  const tryScrollToSection = (section: SectionKey, attemptsLeft = 12) => {
    const offset = sectionOffsets.current[section];

    if (section === 'top' || offset > 0 || attemptsLeft <= 0) {
      pendingSection.current = null;
      scrollToSection(section);
      return;
    }

    pendingSection.current = section;
    requestAnimationFrame(() => {
      tryScrollToSection(section, attemptsLeft - 1);
    });
  };

  useEffect(() => {
    if (!params.section) {
      return;
    }

    const value = params.section as SectionKey;
    const frame = requestAnimationFrame(() => {
      tryScrollToSection(value);
    });

    return () => cancelAnimationFrame(frame);
  }, [params.section]);

  return (
    <>
      <PageHead
        title="StockAisle | Inventory Management Software for Wholesalers"
        description="Run inventory operations with more control, less admin, and complete visibility with StockAisle."
        path="/"
      />

      <PageScrollFrame onSectionPress={scrollToSection} scrollRef={scrollRef}>
        <View onLayout={registerSection('top')} />

        <View style={heroBackgroundStyle} className="px-4 pb-14 pt-5">
          <View className="mx-auto w-full max-w-[1180px] gap-7">
            <View className="flex-row flex-wrap items-stretch gap-7">
              <SurfaceCard className="min-w-[320px] flex-1 bg-surface">
                <View className="gap-5">
                  <Text className="font-display text-[56px] leading-[58px] tracking-[-1.4px] text-text">
                    Run inventory operations with more control, less admin, and complete visibility
                  </Text>
                  <Text className="max-w-[640px] text-base leading-7 text-muted">
                    StockAisle helps inventory-heavy businesses manage stock, purchasing, and operational workflows
                    through governed processes, audit-ready records, and a system built for real-world teams.
                  </Text>

                  <View className="flex-row flex-wrap gap-4">
                    <HeroButton label="Book a Demo" onPress={() => scrollToSection('contact')} />
                    <HeroButton label="Contact Us" variant="secondary" onPress={() => scrollToSection('contact')} />
                  </View>

                  <View className="gap-4 pt-2">
                    {[
                      'Built for SME wholesalers and inventory-driven businesses',
                      'Governed workflows with audit visibility',
                      'Designed for operational clarity and control',
                    ].map((item) => (
                      <View key={item} className="flex-row items-center gap-3">
                        <View className="h-3 w-3 rounded-full bg-success" />
                        <Text className="text-base text-text">{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </SurfaceCard>

              <SurfaceCard className="min-w-[320px] w-[420px] bg-surface">
                <View className="gap-4">
                  <View style={primaryStageStyle} className="rounded-[22px] p-6 shadow-lift">
                    <Text className="mt-3 font-display text-[42px] leading-[44px] tracking-[-1.1px] text-white">
                      Enterprise-grade control for operational teams moving beyond spreadsheets
                    </Text>

                    <View className="mt-6 flex-row flex-wrap gap-3">
                      {[
                        ['Workflow governance', 'GCTE-led'],
                        ['Permissions', 'Role-based'],
                        ['Data posture', 'Audit-ready'],
                      ].map(([label, value]) => (
                        <View key={label} style={stageStatStyle} className="min-w-[110px] flex-1 rounded-2xl px-4 py-3">
                          <Text style={subtleWhiteText} className="text-xs uppercase tracking-[1.4px]">
                            {label}
                          </Text>
                          <Text className="mt-2 text-sm font-semibold text-white">{value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {[
                    ['Inventory visibility', 'Location-aware stock, movements, and receiving in one governed flow'],
                    ['Reduced admin effort', 'Operational steps structured so teams spend less time reconciling exceptions'],
                    ['Decision confidence', 'Approvals, records, and accountability designed into the process'],
                  ].map(([label, value]) => (
                    <View key={label} className="rounded-[20px] border border-border bg-surface px-5 py-4">
                      <Text className="text-sm text-muted">{label}</Text>
                      <Text className="mt-2 text-base font-semibold leading-7 text-text">{value}</Text>
                    </View>
                  ))}
                </View>
              </SurfaceCard>
            </View>
          </View>
        </View>

        <View onLayout={registerSection('about')} className="px-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] gap-8">
            <View className="max-w-[820px] gap-4">
              <Text className="font-display text-[50px] leading-[52px] tracking-[-1.2px] text-text">
                Inventory operations break down when systems do not match how teams actually work
              </Text>
              <Text className="text-base leading-7 text-muted">
                Wholesalers and inventory-heavy businesses rarely fail because of a lack of effort. They struggle when
                the system around the team is informal, fragmented, or dependent on a few people holding operational
                context.
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {problemCards.map((card) => (
                <SurfaceCard key={card.title} className="min-w-[220px] flex-1 bg-surface p-6">
                  <Text className="text-lg font-semibold leading-7 text-text">{card.title}</Text>
                  <Text className="mt-3 text-sm leading-6 text-muted">{card.body}</Text>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </View>

        <View className="px-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] flex-row flex-wrap gap-6">
            <SurfaceCard className="min-w-[320px] flex-1">
              <Text className="font-display text-[42px] leading-[46px] tracking-[-1px] text-text">
                A more structured way to run inventory and trade operations
              </Text>
              <Text className="mt-4 text-base leading-7 text-muted">
                StockAisle introduces a governed operational layer that helps businesses move from reactive inventory
                handling to controlled, traceable workflows.
              </Text>
              <Text className="mt-4 text-base leading-7 text-muted">
                It is designed to support real operational environments, not just ideal workflows. Teams get clearer
                stock visibility, stronger process discipline, and a platform that supports operational control without
                adding friction for everyday users.
              </Text>
            </SurfaceCard>

            <View className="min-w-[320px] flex-1 gap-4">
              {[
                ['01', 'Structured operational layer', 'Standardise how inventory, purchasing, approvals, and trade actions are executed across locations.'],
                ['02', 'Traceable process history', 'Turn operational activity into a reliable record, not a chain of assumptions across tools and inboxes.'],
                ['03', 'Integration-ready foundation', 'Keep room for existing business systems while improving control around the workflows that matter most.'],
              ].map(([index, title, body]) => (
                <SurfaceCard key={index} className="flex-row gap-4 p-5">
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-tint">
                    <Text className="text-sm font-semibold text-primary">{index}</Text>
                  </View>
                  <View className="flex-1 gap-2">
                    <Text className="text-lg font-semibold text-text">{title}</Text>
                    <Text className="text-sm leading-6 text-muted">{body}</Text>
                  </View>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </View>

        <View onLayout={registerSection('features')} className="px-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] gap-8">
            <View className="max-w-[840px] gap-4">
              <Text className="font-display text-[44px] leading-[48px] tracking-[-1px] text-text">
                Built for operators who need trustworthy control across stock, trade, and workflow activity
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {featureCards.map(([title, body]) => (
                <SurfaceCard key={title} className="min-w-[280px] flex-1 p-6">
                  <Text className="text-xl font-semibold text-text">{title}</Text>
                  <Text className="mt-3 text-base leading-7 text-muted">{body}</Text>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </View>

        <View className="px-4 pt-10">
          <View
            className="mx-auto w-full max-w-[1180px] rounded-[32px] px-8 py-10"
            style={{
              // @ts-expect-error web-only CSS background
              backgroundImage:
                'radial-gradient(circle at top right, rgba(176,138,77,0.22), transparent 28%), linear-gradient(160deg, #112137 0%, #173257 48%, #1f3a5f 100%)',
            }}
          >
            <View className="flex-row flex-wrap items-start gap-8">
              <View className="min-w-[300px] flex-1 gap-4">
                <Text className="font-display text-[44px] leading-[48px] tracking-[-1px] text-white">
                  Governed workflows powered by GCTE
                </Text>
                <Text style={mutedWhiteText} className="text-base leading-7">
                  GCTE, the Governed Conversational Transaction Engine, is the control layer behind StockAisle. It is
                  designed so operational actions follow structured rules instead of informal interpretation.
                </Text>
                <Text style={mutedWhiteText} className="text-base leading-7">
                  This is where StockAisle moves beyond standard inventory software. Governance is built into the
                  workflow, not added later as manual oversight.
                </Text>
              </View>

              <SurfaceCard style={whitePanelStyle} className="min-w-[320px] w-[500px] p-6">
                <Text className="text-2xl font-semibold text-white">How GCTE keeps operations controlled</Text>
                <View className="mt-5 gap-3">
                  {[
                    'Actions follow structured rules before inventory records change',
                    'Permissions are enforced according to role and responsibility',
                    'Approvals can be required for sensitive or higher-risk actions',
                    'Every change is traceable through an audit-ready record',
                    'Operations remain controlled even as teams and locations scale',
                  ].map((item) => (
                    <View key={item} className="flex-row gap-3">
                      <View className="mt-2 h-2.5 w-2.5 rounded-full bg-[#f7d8a0]" />
                      <Text style={emphasisWhiteText} className="flex-1 text-base leading-7">
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>

                <View className="mt-6 flex-row flex-wrap gap-3">
                  {['Request', 'Validate', 'Approve', 'Execute', 'Record'].map((item) => (
                    <View key={item} style={whitePanelStyle} className="rounded-2xl border px-4 py-3">
                      <Text className="text-sm font-semibold text-white">{item}</Text>
                    </View>
                  ))}
                </View>
              </SurfaceCard>
            </View>
          </View>
        </View>

        <View className="px-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] gap-8">
            <View className="max-w-[800px] gap-4">
              <Text className="font-display text-[42px] leading-[46px] tracking-[-1px] text-text">
                Designed to work with the tools you already use
              </Text>
              <Text className="text-base leading-7 text-muted">
                StockAisle is built with an integration-ready architecture to support existing business systems. The
                platform is designed to work with operational tooling already present across wholesale and
                inventory-heavy environments.
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {['Excel', 'Shopify', 'WooCommerce', 'Xero', 'POS systems', 'ERP systems'].map((item) => (
                <SurfaceCard key={item} className="min-w-[170px] flex-1 items-center justify-center py-7">
                  <Text className="text-lg font-semibold text-primary">{item}</Text>
                </SurfaceCard>
              ))}
            </View>

            <Text className="text-sm leading-6 text-muted">
              Integration-ready means the platform is designed to support connected business systems. It does not imply
              currently active native integrations.
            </Text>
          </View>
        </View>

        <View onLayout={registerSection('pricing')} className="px-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] gap-8">
            <View className="max-w-[840px] gap-4">
              <Text className="font-display text-[42px] leading-[46px] tracking-[-1px] text-text">
                Clear packages for businesses moving toward more governed inventory operations
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {[
                ['Starter', '£99', 'For smaller teams replacing spreadsheet-led stock management with a more controlled operational baseline.'],
                ['Standard', '£299', 'For growing wholesalers that need clearer workflows, stronger controls, and audit visibility across teams.'],
                ['Pro', '£499', 'For multi-location or more operationally complex businesses requiring deeper governance and scale readiness.'],
              ].map(([tier, price, body], index) => (
                <SurfaceCard key={tier} className={`min-w-[280px] flex-1 p-7 ${index === 1 ? 'border-primary bg-surface' : ''}`}>
                  <Text className="text-sm font-semibold uppercase tracking-[1.8px] text-primary">{tier}</Text>
                  <Text className="mt-5 font-display text-[48px] leading-[50px] tracking-[-1.2px] text-text">
                    {price}
                    <Text className="text-base text-muted">/month</Text>
                  </Text>
                  <Text className="mt-4 text-base leading-7 text-muted">{body}</Text>
                  <View className="mt-6">
                    <HeroButton label="Book a Demo" onPress={() => scrollToSection('contact')} />
                  </View>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </View>

        <View onLayout={registerSection('contact')} className="px-4 pb-4 pt-10">
          <View className="mx-auto w-full max-w-[960px]">
            <View className="min-w-[320px] flex-1">
              <ContactForm />
            </View>
          </View>
        </View>
      </PageScrollFrame>
    </>
  );
}
