<script>
  import { enhance } from '$app/forms';
  export let data;
  export let form;

  const money = (cents) =>
    (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }
</script>

<h1>{data.group.name}</h1>
<p class="muted">Signed in as {data.me.name} · <a href="/">all groups</a></p>

{#if data.group.archived}
  <div class="card archived-banner">
    <p style="margin:0;">
      <strong>This group is archived.</strong> Everything is preserved and read-only.
      Restore it below to add expenses or payments again.
    </p>
  </div>
{/if}

<h2>Balances</h2>
<div class="card">
  {#each data.balances as b}
    <div class="row">
      <span>{b.name}{b.id === data.me.id ? ' (you)' : ''}{b.left ? ' (left)' : ''}</span>
      <span class={b.cents > 0 ? 'pos' : b.cents < 0 ? 'neg' : 'muted'}>
        {b.cents > 0 ? 'gets back ' : b.cents < 0 ? 'owes ' : 'settled '}
        {b.cents === 0 ? '' : money(Math.abs(b.cents))}
      </span>
    </div>
  {/each}
</div>

<h2>Settle up</h2>
<div class="card">
  {#if data.transfers.length === 0}
    <p class="muted">Everyone's even.</p>
  {:else}
    {#each data.transfers as t}
      <div class="row">
        <span><strong>{t.fromName}</strong> pays <strong>{t.toName}</strong></span>
        <span class="amt">{money(t.amountCents)}</span>
      </div>
    {/each}
  {/if}
</div>

{#if !data.group.archived}
<h2>Add expense</h2>
<form class="card" method="POST" action="?/addExpense" use:enhance>
  <label for="description">Description</label>
  <input id="description" name="description" placeholder="Groceries" autocomplete="off" />

  <label for="amount">Amount ($)</label>
  <input id="amount" name="amount" inputmode="decimal" placeholder="42.50" autocomplete="off" />

  <label for="paidById">Paid by</label>
  <select id="paidById" name="paidById">
    {#each data.activeMembers as m}
      <option value={m.id} selected={m.id === data.me.id}>{m.name}</option>
    {/each}
  </select>

  <span class="field-label">Split between</span>
  {#each data.activeMembers as m}
    <label style="display:flex; align-items:center; gap:10px; color:var(--text); margin:6px 0;">
      <input type="checkbox" name="participants" value={m.id} checked style="width:auto; flex:0 0 auto;" />
      {m.name}
    </label>
  {/each}

  {#if form?.addError}<p class="error">{form.addError}</p>{/if}
  <button type="submit">Add expense</button>
</form>

<h2>Record a payment</h2>
<form class="card" method="POST" action="?/settle" use:enhance>
  <label for="fromId">From</label>
  <select id="fromId" name="fromId">
    {#each data.settleMembers as m}
      <option value={m.id} selected={m.id === data.me.id}>{m.name}{m.left ? ' (left)' : ''}</option>
    {/each}
  </select>

  <label for="toId">To</label>
  <select id="toId" name="toId">
    {#each data.settleMembers as m}
      <option value={m.id}>{m.name}{m.left ? ' (left)' : ''}</option>
    {/each}
  </select>

  <label for="settleAmount">Amount ($)</label>
  <input id="settleAmount" name="amount" inputmode="decimal" placeholder="10.00" autocomplete="off" />

  {#if form?.settleError}<p class="error">{form.settleError}</p>{/if}
  <button type="submit">Record payment</button>
</form>
{/if}

<h2>People</h2>
{#if data.group.archived}
  <div class="card">
    {#each data.activeMembers as m}
      <div class="row">
        <span>
          {m.name}{m.id === data.me.id ? ' (you)' : ''}<br />
          <span class="muted">{m.email || m.accountEmail || 'no contact email'}</span>
        </span>
        <span class="muted">{m.claimed ? 'joined' : 'not joined yet'}</span>
      </div>
    {/each}
  </div>
{:else}
  {#each data.activeMembers as m}
    <form class="card" method="POST" action="?/editMember" use:enhance>
      <input type="hidden" name="memberId" value={m.id} />
      <div class="row" style="margin-bottom:6px;">
        <span class="field-label" style="margin:0;">
          {m.id === data.me.id ? 'You' : m.name}
        </span>
        <span class="muted">{m.claimed ? 'joined' : 'not joined yet'}</span>
      </div>

      <label for={`name-${m.id}`}>Name</label>
      <input id={`name-${m.id}`} name="name" value={m.name} autocomplete="off" />

      <label for={`email-${m.id}`}>Contact email (for reminders)</label>
      <input
        id={`email-${m.id}`}
        name="email"
        type="email"
        value={m.email}
        placeholder={m.id === data.me.id && m.accountEmail
          ? `account email: ${m.accountEmail}`
          : 'email (optional)'}
        autocomplete="off"
      />

      {#if form?.editId === m.id && form?.editError}<p class="error">{form.editError}</p>{/if}
      {#if form?.editId === m.id && form?.memberEdited}<p class="muted">Saved.</p>{/if}
      <button type="submit" class="btn-ghost">Save</button>
    </form>
  {/each}
{/if}
{#if !data.group.archived}
<form class="card" method="POST" action="?/addMember" use:enhance>
  <label for="memberName">Add a person (they can claim their name later via the invite link)</label>
  <input id="memberName" name="name" placeholder="Sam" autocomplete="off" />
  {#if form?.memberError}<p class="error">{form.memberError}</p>{/if}
  <button type="submit" class="btn-ghost">Add person</button>
</form>
{/if}

<h2>Expenses</h2>
<div class="card">
  {#if data.expenses.length === 0}
    <p class="muted">No expenses yet.</p>
  {:else}
    {#each data.expenses as e}
      <div class="row" class:archived-expense={e.archived}>
        <span>{e.description}{e.archived ? ' (archived)' : ''}<br /><span class="muted">paid by {e.paidByName}</span></span>
        <span style="display:flex; align-items:center; gap:12px;">
          <span class="amt">{money(e.amountCents)}</span>
          {#if !data.group.archived}
            {#if e.archived}
              <form method="POST" action="?/restoreExpense" use:enhance>
                <input type="hidden" name="expenseId" value={e.id} />
                <button
                  type="submit"
                  title="Restore"
                  style="width:auto; margin:0; padding:6px 10px; background:transparent; border:1px solid var(--border); color:var(--muted);"
                  >↩</button
                >
              </form>
            {:else}
              <form method="POST" action="?/archiveExpense" use:enhance>
                <input type="hidden" name="expenseId" value={e.id} />
                <button
                  type="submit"
                  title="Archive"
                  style="width:auto; margin:0; padding:6px 10px; background:transparent; border:1px solid var(--border); color:var(--muted);"
                  >✕</button
                >
              </form>
            {/if}
          {/if}
        </span>
      </div>
    {/each}
  {/if}
</div>

{#if data.settlements.length > 0}
  <h2>Payment history</h2>
  <div class="card">
    {#each data.settlements as s}
      <div class="row">
        <span>{s.fromName} → {s.toName}</span>
        <span class="amt">{money(s.amountCents)}</span>
      </div>
    {/each}
  </div>
{/if}

{#if !data.group.archived}
<h2>Invite people</h2>
<div class="card">
  <p class="muted" style="margin-top:0;">Anyone with this link can join the group.</p>
  <div class="linkbox">
    <input readonly value={data.inviteUrl} />
    <button type="button" class="btn-ghost" on:click={() => copy(data.inviteUrl)}>Copy</button>
  </div>
</div>
{/if}

{#if data.group.archived}
  <h2>Restore</h2>
  <div class="card">
    <form method="POST" action="?/restoreGroup" use:enhance>
      <p class="muted" style="margin-top:0;">
        Bring this group back to active. All expenses, members and history are exactly as you
        left them.
      </p>
      <button type="submit">Restore group</button>
    </form>
  </div>
{/if}

<h2 class="danger-heading">Danger zone</h2>
<div class="card danger">
  <form
    method="POST"
    action="?/leaveGroup"
    use:enhance
    on:submit={(e) => {
      if (!confirm(`Leave "${data.group.name}"? Your past expenses stay in the group.`)) e.preventDefault();
    }}
  >
    <p class="muted" style="margin-top:0;">
      Leave the group. Your past expenses stay so balances are preserved, but you drop off the
      group and won't be in new splits.
    </p>
    <button type="submit" class="btn-ghost">Leave group</button>
  </form>

  {#if !data.group.archived}
    <hr style="border:none; border-top:1px solid var(--border); margin:18px 0;" />

    <form
      method="POST"
      action="?/archiveGroup"
      use:enhance
      on:submit={(e) => {
        if (!confirm(`Archive "${data.group.name}"? It becomes read-only but nothing is deleted — you can restore it anytime.`)) e.preventDefault();
      }}
    >
      <p class="muted" style="margin-top:0;">
        Archive the group for everyone. All expenses, members and history are kept and the group
        becomes read-only. You can restore it at any time — nothing is ever deleted.
      </p>
      <button type="submit" class="btn-ghost">Archive this group</button>
    </form>
  {/if}
</div>
