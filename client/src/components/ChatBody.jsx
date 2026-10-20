export default function ChatBody({
  messages,
  text,
  error,
  canChat,
  inputDisabled,
  onChangeText,
  onSubmit,
  messagesRef,
}) {
  return (
    <>
      <div className="chat-messages" ref={messagesRef} aria-live="polite">
        {!canChat && <p className="chat-empty">Join a game to chat.</p>}
        {canChat && messages.length === 0 && (
          <p className="chat-empty">No messages yet.</p>
        )}
        {messages.map((message, index) => (
          <div
            className="chat-message"
            key={`${message.username}-${message.text}-${index}`}
          >
            <strong>{message.username}</strong>
            <span>{message.text}</span>
          </div>
        ))}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          id="chat-message"
          type="text"
          value={text}
          maxLength={140}
          placeholder={canChat ? 'Write a message' : 'Join a game first'}
          disabled={inputDisabled}
          onChange={(event) => onChangeText(event.target.value)}
        />
        <button
          className="chat-send"
          type="submit"
          disabled={inputDisabled || !text.trim()}
          aria-label="Send chat message"
        >
          Send
        </button>
      </form>

      <div className="chat-footer">
        <span>{text.length}/140</span>
        {error && (
          <span className="chat-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </>
  );
}