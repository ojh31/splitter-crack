<script>
  import { enhance } from '$app/forms';
  export let data;
  export let form;
</script>

<h1>Join {data.groupName}</h1>

{#if data.placeholders.length > 0}
  <h2>Are you one of these?</h2>
  <div class="card">
    <p class="muted" style="margin-top:0;">Someone already added these names. Tap yours to claim it.</p>
    {#each data.placeholders as p}
      <form method="POST" use:enhance class="claimform">
        <input type="hidden" name="claimId" value={p.id} />
        <button type="submit" class="btn-ghost claimbtn">{p.name}</button>
      </form>
    {/each}
  </div>
{/if}

<h2>{data.placeholders.length > 0 ? 'Or add yourself' : 'Pick your name'}</h2>
<form class="card" method="POST" use:enhance>
  <label for="name">Your name</label>
  <input id="name" name="name" placeholder="Oskar" autocomplete="off" />
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <button type="submit">Join group</button>
</form>
