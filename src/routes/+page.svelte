<script>
  import { enhance } from '$app/forms';
  export let data;
  export let form;
</script>

<h1>Split bills with your housemates</h1>
<p class="muted">Create a group, share the invite link, and let everyone log expenses. No passwords.</p>

{#if data.member}
  <a class="btn" href={`/g/${data.member.groupId}`}>Go to your group</a>
{/if}

<h2>New group</h2>
<form class="card" method="POST" action="?/create" use:enhance>
  <label for="groupName">Group name</label>
  <input id="groupName" name="groupName" placeholder="Flat 3B" autocomplete="off" />

  <label for="yourName">Your name</label>
  <input id="yourName" name="yourName" placeholder="Oskar" autocomplete="off" />

  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <button type="submit">Create group</button>
</form>
