export const pricingPlans = [
  {
    name: 'Starter',
    price: '£99/month',
    bestFor: 'Smaller single-location teams',
    previewPoints: ['Single location', 'Core updates', 'Basic reporting'],
    fullPoints: ['Core stock queries', 'Stock updates', 'Basic reports', 'Simple controls'],
  },
  {
    name: 'Standard',
    price: '£299/month',
    bestFor: 'Growing teams with more users and locations',
    previewPoints: ['Multi-user', 'Multi-location', 'Audit-ledger support'],
    fullPoints: ['Everything in Starter', 'Multi-user access', 'Multi-location support', 'Stronger audit controls', 'Priority support'],
    featured: true,
    badge: 'Best fit',
  },
  {
    name: 'Pro',
    price: '£499/month',
    bestFor: 'Larger or more controlled operations',
    previewPoints: ['Advanced governance', 'Deeper control', 'Priority support'],
    fullPoints: ['Everything in Standard', 'Advanced approvals', 'Deeper governance', 'Higher-control workflows', 'Premium support'],
  },
] as const;

export const faqItems = [
  {
    question: 'Who is StockAisle for?',
    answer:
      'StockAisle is built for wholesalers and inventory-heavy SME businesses that want better stock control without adding more admin.',
  },
  {
    question: 'Is StockAisle only for inventory?',
    answer: 'No. It also supports trade operations such as purchase and sales workflows.',
  },
  {
    question: 'Can staff use simple language?',
    answer: 'Yes. The platform is designed for natural everyday language.',
  },
  {
    question: 'How does StockAisle keep things controlled?',
    answer: 'It uses confirmations, permissions, approvals, and audit history.',
  },
  {
    question: 'Can it work with our current spreadsheets?',
    answer: 'Yes. Excel-first onboarding is part of the product direction.',
  },
  {
    question: 'Does it support multiple locations?',
    answer: 'Yes. StockAisle is designed to support growing operations across locations.',
  },
  {
    question: 'Is there a full record of changes?',
    answer: 'Yes. Every important action can be tracked clearly.',
  },
  {
    question: 'Do I need a technical team to use it?',
    answer: 'No. It is designed for real business teams, not just system experts.',
  },
] as const;

export const howItWorksSteps = [
  {
    step: 'Step 1',
    title: 'Ask or tell',
    text: 'A user asks a question or records an action in plain language.',
  },
  {
    step: 'Step 2',
    title: 'StockAisle checks context',
    text: 'The system checks products, quantities, location, and rules.',
  },
  {
    step: 'Step 3',
    title: 'Confirm before change',
    text: 'Important actions are confirmed before anything is posted.',
  },
  {
    step: 'Step 4',
    title: 'Apply permissions and approvals',
    text: 'High-risk actions can require manager approval.',
  },
  {
    step: 'Step 5',
    title: 'Record the outcome',
    text: 'Every completed action is saved with clear history.',
  },
] as const;
