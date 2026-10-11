import React, {useEffect, useRef, useState} from 'react';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  CheckCheck,
  ChevronRight,
  Compass,
  FileText,
  GitBranch,
  Lightbulb,
  MessageSquareText,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Target,
  Wrench,
} from 'lucide-react';
import {api} from '../api';
import './QueryAnalyst.css';

export type QuestionItem = {
  id: string;
  question: string;
  angle: string;
  complexity: 'Fundamental' | 'Intermediate' | 'Complex & Novel';
  why_it_matters: string;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  stage?: 'greeting' | 'questions' | 'exploration' | 'chat';
  isError?: boolean;
  questions?: QuestionItem[];
  exploration?: {
    action: 'theories' | 'keywords' | 'mapping' | 'methods';
    title: string;
    content: string;
    sections?: {heading: string; body: string; tags?: string[]}[];
    next_options?: {id: string; label: string; icon?: string}[];
  };
};

type QueryAnalystProps = {
  onSendToDesk: (question: string) => void;
  onSendToOrchestrator: (question: string) => void;
};

type ExploreAction = 'theories' | 'keywords' | 'mapping' | 'methods';

const AUDIENCE_OPTIONS = [
  {id: 'all', label: 'Broad view', desc: 'Balance policy, academic, community and market perspectives.'},
  {id: 'policy', label: 'Policy', desc: 'Focus on actionable policy choices and institutional reform.'},
  {id: 'academic', label: 'Academic', desc: 'Focus on theory, concepts and causal explanation.'},
  {id: 'ngo', label: 'Practice', desc: 'Focus on field realities, implementation and human outcomes.'},
  {id: 'industry', label: 'Industry', desc: 'Focus on markets, technology and investment feasibility.'},
];

const PROMPT_SUGGESTIONS = [
  "Has Bangladesh's GDP growth masked deeper inequalities in household consumption?",
  'Does microfinance expand women’s choices or deepen informal debt cycles?',
  'How could climate migration reshape urban labor markets by 2030?',
  'Are social safety nets protecting the ultra-poor during periods of inflation?',
];

const ACTIONS: {id: ExploreAction; label: string; shortLabel: string; icon: React.ReactNode}[] = [
  {id: 'theories', label: 'Explore theory', shortLabel: 'Theories', icon: <BookOpen size={16}/>},
  {id: 'keywords', label: 'Analyze keywords', shortLabel: 'Keywords', icon: <Search size={16}/>},
  {id: 'mapping', label: 'Map the context', shortLabel: 'Problem map', icon: <Compass size={16}/>},
  {id: 'methods', label: 'Review methods', shortLabel: 'Methods', icon: <Wrench size={16}/>},
];

const actionLabel = (action: ExploreAction) => ACTIONS.find(item => item.id === action)?.label || 'Explore';
const timestamp = () => new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

function InlineText({text}: {text: string}) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return <>{parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <React.Fragment key={index}>{part.split('\n').map((line, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br/>}{line}</React.Fragment>)}</React.Fragment>;
  })}</>;
}

function MessageCopy({text}: {text: string}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;
  const startsBlock = (line: string) => /^(#{1,6}\s|\s*([-*+] |\d+[.)] )|\s*>|\s*```|---+$)/.test(line);

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={blocks.length} data-language={language || undefined}><code>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Heading = heading[1].length <= 2 ? 'h3' : 'h4';
      blocks.push(<Heading key={blocks.length}><InlineText text={heading[2]}/></Heading>);
      index++;
      continue;
    }
    if (/^(---+|___+|\*\*\*+)$/.test(line)) { blocks.push(<hr key={blocks.length}/>); index++; continue; }

    if (/^\s*>\s?/.test(lines[index])) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={blocks.length}><InlineText text={quote.join('\n')}/></blockquote>);
      continue;
    }

    const firstListItem = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (firstListItem) {
      const ordered = /^\d/.test(firstListItem[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]);
        index++;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={blocks.length}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item}/></li>)}</List>);
      continue;
    }

    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index].trim())) paragraph.push(lines[index++].trim());
    blocks.push(<p key={blocks.length}><InlineText text={paragraph.join('\n')}/></p>);
  }

  return <div className="analyst-copy">{blocks}</div>;
}

function makeMessage(content: string, options: Partial<Message> = {}): Message {
  return {id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: 'assistant', content, timestamp: timestamp(), ...options};
}

export function QueryAnalyst({onSendToDesk, onSendToOrchestrator}: QueryAnalystProps) {
  const [messages, setMessages] = useState<Message[]>([
    makeMessage(
      'Bring a rough idea, a tension you have noticed, or a question that is still taking shape. I’ll help turn it into a focused research question, then explore the theory, context and methods around it.',
      {id: 'welcome', timestamp: 'Ready when you are', stage: 'greeting'},
    ),
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAudience, setActiveAudience] = useState('all');
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [currentQuestions, setCurrentQuestions] = useState<QuestionItem[]>([]);
  const [activeQuestionMessageId, setActiveQuestionMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }, [messages, loading]);

  const handleToggleQuestion = (id: string) => {
    setSelectedQuestionIds(previous => {
      if (selectionMode === 'single') return [id];
      return previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id];
    });
  };

  const selectedQuestions = currentQuestions.filter(question => selectedQuestionIds.includes(question.id));
  const activeQuestionText = selectedQuestions[0]?.question;

  const handleGenerateQuestions = async (ideaText?: string) => {
    const text = (ideaText ?? input).trim();
    if (!text || loading) return;

    const requestId = ++requestRef.current;
    setMessages(previous => [...previous, {
      id: `user-${requestId}`, role: 'user', content: text, timestamp: timestamp(),
    }]);
    setInput('');
    setLoading(true);

    try {
      const response = await api<any>('/query-analyst/', {
        stage: 'generate_questions', idea: text, audience: activeAudience,
      });
      if (requestId !== requestRef.current) return;

      const questions: QuestionItem[] = Array.isArray(response.questions) ? response.questions : [];
      const assistantId = `assistant-${requestId}`;
      setCurrentQuestions(questions);
      setSelectedQuestionIds(questions.length ? [questions[0].id] : []);
      setActiveQuestionMessageId(assistantId);
      setMessages(previous => [...previous, makeMessage(
        response.chat_message || `I’ve shaped your idea into ${questions.length} research question${questions.length === 1 ? '' : 's'}. Choose one to continue, or select several for a combined exploration.`,
        {id: assistantId, stage: 'questions', questions},
      )]);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setMessages(previous => [...previous, makeMessage(
        `I couldn’t analyze that idea. ${errorMessage(error)}`,
        {isError: true},
      )]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const handleExploreAction = async (action: ExploreAction) => {
    if (!selectedQuestions.length || loading) return;
    const requestId = ++requestRef.current;
    const selectedTexts = selectedQuestions.map(question => question.question);
    setMessages(previous => [...previous, {
      id: `user-${requestId}`, role: 'user',
      content: `Explore ${actionLabel(action).toLowerCase()} for ${selectedTexts.length === 1 ? 'my selected question' : 'my selected questions'}.`,
      timestamp: timestamp(),
    }]);
    setLoading(true);

    try {
      const response = await api<any>('/query-analyst/', {
        stage: 'explore_topic', selected_questions: selectedTexts, action,
      });
      if (requestId !== requestRef.current) return;
      setMessages(previous => [...previous, makeMessage(
        response.chat_message || `Here is the ${actionLabel(action).toLowerCase()} analysis.`,
        {
          stage: 'exploration',
          exploration: {
            action,
            title: response.title || actionLabel(action),
            content: response.content || '',
            sections: Array.isArray(response.sections) ? response.sections : [],
            next_options: Array.isArray(response.next_options) ? response.next_options : [],
          },
        },
      )]);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setMessages(previous => [...previous, makeMessage(
        `I couldn’t complete that exploration. ${errorMessage(error)}`,
        {isError: true},
      )]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;
    if (currentQuestions.length === 0) {
      await handleGenerateQuestions();
      return;
    }

    const text = input.trim();
    const requestId = ++requestRef.current;
    setInput('');
    setMessages(previous => [...previous, {
      id: `user-${requestId}`, role: 'user', content: text, timestamp: timestamp(),
    }]);
    setLoading(true);

    try {
      const history = messages.map(message => ({role: message.role, content: message.content}));
      const response = await api<any>('/query-analyst/', {
        stage: 'chat', message: text, history,
        selected_questions: selectedQuestions.map(question => question.question),
      });
      if (requestId !== requestRef.current) return;
      setMessages(previous => [...previous, makeMessage(
        response.reply || response.chat_message || 'What would you like to investigate next?',
        {stage: 'chat'},
      )]);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setMessages(previous => [...previous, makeMessage(
        `I couldn’t send that follow-up. ${errorMessage(error)}`,
        {isError: true},
      )]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const handleReset = () => {
    requestRef.current += 1;
    setLoading(false);
    setCurrentQuestions([]);
    setSelectedQuestionIds([]);
    setActiveQuestionMessageId(null);
    setSelectionMode('single');
    setMessages([makeMessage(
      'Start with a rough idea, a policy tension, or a question you want to understand better. I’ll help shape it into a researchable inquiry.',
      {id: `welcome-${Date.now()}`, timestamp: 'Ready when you are', stage: 'greeting'},
    )]);
    setInput('');
    inputRef.current?.focus();
  };

  const handleAudienceChange = (id: string) => setActiveAudience(id);
  const isWorking = loading;

  return <div className="analyst-shell">
    <section className="analyst-hero card" aria-labelledby="analyst-title">
      <div className="analyst-hero-copy">
        <div className="analyst-hero-mark"><BrainCircuit size={23}/></div>
        <div className="analyst-hero-text">
          <div className="kicker">RESEARCH DESIGN STUDIO</div>
          <h1 id="analyst-title">Agent Query</h1>
          <p>Turn an early thought into a clearer, more researchable question.</p>
          <div className="analyst-hero-steps" aria-label="What the analyst can help with">
            <span><Sparkles size={14}/> Frame an idea</span>
            <ChevronRight size={14} aria-hidden="true"/>
            <span><Target size={14}/> Shape questions</span>
            <ChevronRight size={14} aria-hidden="true"/>
            <span><BookOpen size={14}/> Explore methods</span>
          </div>
        </div>
      </div>
      <div className="analyst-hero-side">
        <div className="analyst-prism-art" aria-hidden="true"><span className="analyst-orbit analyst-orbit-one"/><span className="analyst-orbit analyst-orbit-two"/><span className="analyst-prism-core"><Sparkles size={33}/></span></div>
        <button className="btn-ghost analyst-reset-btn" type="button" onClick={handleReset} disabled={isWorking} title="Start a fresh idea">
          <RotateCcw size={15}/><span>New idea</span>
        </button>
      </div>
    </section>

    <section className="analyst-audience card" aria-label="Choose an audience perspective">
      <div className="analyst-audience-heading">
        <span className="analyst-audience-icon"><Target size={17}/></span>
        <div><strong>Choose a perspective</strong><span>Guide the questions toward the audience you have in mind.</span></div>
      </div>
      <div className="analyst-audience-options" role="group" aria-label="Audience lens">
        {AUDIENCE_OPTIONS.map(option => <button
          key={option.id}
          type="button"
          className={`analyst-audience-option ${activeAudience === option.id ? 'is-active' : ''}`}
          onClick={() => handleAudienceChange(option.id)}
          title={option.desc}
          aria-pressed={activeAudience === option.id}
          disabled={isWorking}
        ><span>{option.label}</span>{activeAudience === option.id && <Check size={14}/>}</button>)}
      </div>
    </section>

    <section className="analyst-conversation" aria-label="Agent Query conversation" aria-live="polite">
      {messages.map(message => {
        const isUser = message.role === 'user';
        const isCurrentQuestionSet = message.id === activeQuestionMessageId;
        return <article key={message.id} className={`analyst-message ${isUser ? 'is-user' : 'is-agent'} ${message.isError ? 'is-error' : ''}`}>
          <div className="analyst-message-avatar" aria-hidden="true">
            {isUser ? <span className="analyst-user-avatar">Y</span> : <span className="analyst-agent-avatar"><BrainCircuit size={17}/></span>}
          </div>
          <div className="analyst-message-main">
            <header className="analyst-message-meta">
              <strong>{isUser ? 'You' : 'Agent Query'}</strong>
              <span>{message.timestamp}</span>
              {message.isError && <span className="analyst-error-label">Couldn’t complete</span>}
            </header>
            <div className={`analyst-message-body ${isUser ? 'analyst-user-bubble' : ''}`}>
              <MessageCopy text={message.content}/>
            </div>

            {message.questions && message.questions.length > 0 && <section className="analyst-questions-card card" aria-label="Generated research questions">
              <div className="analyst-module-heading">
                <div><div className="kicker">YOUR RESEARCH DIRECTIONS</div><h2>Questions to explore <span>{message.questions.length}</span></h2></div>
                {isCurrentQuestionSet ? <div className="analyst-selection-mode" role="group" aria-label="Question selection mode">
                  <button type="button" className={selectionMode === 'single' ? 'is-active' : ''} aria-pressed={selectionMode === 'single'} onClick={() => {setSelectionMode('single'); setSelectedQuestionIds(current => current.slice(0, 1));}}>One</button>
                  <button type="button" className={selectionMode === 'multiple' ? 'is-active' : ''} aria-pressed={selectionMode === 'multiple'} onClick={() => setSelectionMode('multiple')}>Several</button>
                </div> : <span className="analyst-previous-label">Previous set</span>}
              </div>
              <div className="analyst-question-list">
                {message.questions.map((question, index) => {
                  const selected = isCurrentQuestionSet && selectedQuestionIds.includes(question.id);
                  const complexityClass = question.complexity === 'Complex & Novel' ? 'is-novel' : question.complexity === 'Intermediate' ? 'is-intermediate' : 'is-fundamental';
                  return <button key={question.id || index} type="button" className={`analyst-question ${selected ? 'is-selected' : ''}`} onClick={() => isCurrentQuestionSet && handleToggleQuestion(question.id)} aria-pressed={selected} disabled={!isCurrentQuestionSet}>
                    <span className="analyst-question-check">{selected ? <CheckCheck size={18}/> : <span/>}</span>
                    <span className="analyst-question-copy">
                      <span className="analyst-question-tags"><span className="analyst-angle">{question.angle || 'Research angle'}</span><span className={`analyst-complexity ${complexityClass}`}>{question.complexity || 'Fundamental'}</span></span>
                      <strong>{question.question}</strong>
                      {question.why_it_matters && <span className="analyst-question-why"><b>Why this matters</b>{question.why_it_matters}</span>}
                    </span>
                    <ChevronRight className="analyst-question-chevron" size={17}/>
                  </button>;
                })}
              </div>

              {isCurrentQuestionSet && <div className="analyst-next-step">
                <div className="analyst-next-heading"><span className="analyst-next-spark"><Sparkles size={15}/></span><div><strong>{selectedQuestions.length} selected</strong><span>Choose a direction for the next pass.</span></div></div>
                <div className="analyst-action-grid">
                  {ACTIONS.map(action => <button key={action.id} type="button" className="analyst-action" onClick={() => void handleExploreAction(action.id)} disabled={isWorking || selectedQuestions.length === 0}>
                    {action.icon}<span>{action.label}</span><ArrowRight size={14} className="analyst-action-arrow"/>
                  </button>)}
                </div>
                {activeQuestionText && <div className="analyst-launch">
                  <div><span className="analyst-launch-dot"/><span>Ready to start evidence-backed research?</span></div>
                  <div className="analyst-launch-actions">
                    <button className="btn-ghost" type="button" onClick={() => onSendToDesk(activeQuestionText)}><FileText size={15}/> Agent Desk</button>
                    <button className="btn-primary" type="button" onClick={() => onSendToOrchestrator(activeQuestionText)}><GitBranch size={15}/> Agent Research</button>
                  </div>
                </div>}
              </div>}
            </section>}

            {message.exploration && <section className="analyst-exploration card" aria-label="Exploration results">
              <div className="analyst-exploration-heading"><span className="analyst-exploration-icon"><BookOpen size={17}/></span><div><div className="kicker">DEEP DIVE · {actionLabel(message.exploration.action)}</div><h2>{message.exploration.title}</h2></div></div>
              {message.exploration.content && <MessageCopy text={message.exploration.content}/>}
              {message.exploration.sections && message.exploration.sections.length > 0 && <div className="analyst-exploration-grid">
                {message.exploration.sections.map((section, index) => <article className="analyst-exploration-item" key={`${section.heading}-${index}`}>
                  <h3>{section.heading}</h3><p>{section.body}</p>
                  {!!section.tags?.length && <div className="analyst-tags">{section.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
                </article>)}
              </div>}
              <div className="analyst-exploration-footer">
                <span>Continue this line of inquiry</span>
                <div className="analyst-action-compact">
                  {ACTIONS.filter(action => action.id !== message.exploration?.action).map(action => <button key={action.id} type="button" onClick={() => void handleExploreAction(action.id)} disabled={isWorking || selectedQuestions.length === 0}>{action.icon}{action.shortLabel}</button>)}
                </div>
                {activeQuestionText && <button className="analyst-orchestrate-link" type="button" onClick={() => onSendToOrchestrator(activeQuestionText)}>Continue with Agent Research <ArrowRight size={14}/></button>}
              </div>
            </section>}
          </div>
        </article>;
      })}

      {loading && <div className="analyst-thinking" role="status"><span className="analyst-thinking-mark"><BrainCircuit size={17}/></span><span className="analyst-thinking-dots"><i/><i/><i/></span><span>Thinking through your inquiry…</span></div>}
      <div ref={scrollRef}/>
    </section>

    {currentQuestions.length === 0 && !loading && <section className="analyst-suggestions" aria-label="Example research ideas">
      <div className="analyst-suggestions-heading"><Lightbulb size={16}/><div><strong>Need a starting point?</strong><span>Choose an example, then make it your own.</span></div></div>
      <div className="analyst-suggestion-grid">{PROMPT_SUGGESTIONS.map((suggestion, index) => <button key={index} type="button" className="analyst-suggestion" onClick={() => {setInput(suggestion); inputRef.current?.focus();}}><MessageSquareText size={15}/><span>{suggestion}</span><ArrowRight size={14}/></button>)}</div>
    </section>}

    <form className="analyst-composer card" onSubmit={event => {event.preventDefault(); void handleSendMessage();}}>
      <label className="analyst-composer-label" htmlFor="analyst-input"><span className="analyst-composer-icon"><MessageSquareText size={16}/></span><span>{currentQuestions.length === 0 ? 'Your starting idea' : 'Keep shaping the inquiry'}</span></label>
      <textarea
        id="analyst-input"
        ref={inputRef}
        value={input}
        maxLength={600}
        rows={3}
        onChange={event => setInput(event.target.value)}
        placeholder={currentQuestions.length === 0 ? 'Describe what you are noticing, wondering about, or trying to understand…' : 'Ask a follow-up, refine a question, or share a method preference…'}
        onKeyDown={event => {if (event.key === 'Enter' && !event.shiftKey) {event.preventDefault(); void handleSendMessage();}}}
        disabled={isWorking}
        aria-describedby="analyst-composer-hint"
      />
      <div className="analyst-composer-footer">
        <span id="analyst-composer-hint">{input.length}/600 <i/> Enter to send <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line</span>
        <button className="btn-primary analyst-send" type="submit" disabled={!input.trim() || isWorking}>
          <span>{isWorking ? 'Working…' : currentQuestions.length === 0 ? 'Analyze idea' : 'Send follow-up'}</span><Send size={15}/>
        </button>
      </div>
    </form>
    <p className="analyst-footnote"><span><Sparkles size={13}/></span>Start with an imperfect idea. You can refine the question as the research takes shape.</p>
  </div>;
}
